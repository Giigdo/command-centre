from __future__ import annotations

import os
import re
import sqlite3
import yaml
from datetime import date, datetime
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import threading

app = Flask(__name__)
CORS(app)

VAULT_PATH = Path(os.environ.get(
    "VAULT_PATH",
    "/Users/andrew/My Drive/DriveSyncFiles/System"
))
PROJECTS_PATH = VAULT_PATH / "Projects"

_cache = {"projects": [], "last_updated": None}
_cache_lock = threading.Lock()

STATUS_ORDER = {"active": 0, "waiting": 1, "paused": 2, "complete": 3}

PROJECT_TEMPLATE = """---
dashboard: true
title: "{title}"
client: ""
status: active
started: {today}
due: {due}
next_action: ""
obsidian_note: "obsidian://open?vault=System&file=Projects/{slug}"
claude_project: ""
drive_folder: ""
github_repo: ""
google_doc: ""
local_file: ""
url: ""
---

## Notes

Add context, links to related notes, and anything else relevant here.
"""

# ── SQLite time-tracking setup ─────────────────────────────────────────────

# Store the database in the vault's Data folder so it syncs via Google Drive
DATA_DIR = VAULT_PATH / "Data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "timetracker.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS time_entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    TEXT    NOT NULL,
            project_title TEXT    NOT NULL,
            client        TEXT    DEFAULT '',
            task          TEXT    DEFAULT '',
            start_time    TEXT    NOT NULL,
            end_time      TEXT,
            duration_secs REAL,
            source        TEXT    DEFAULT 'timer'
        )
    """)
    # Add source column to existing databases that don't have it yet
    try:
        conn.execute("ALTER TABLE time_entries ADD COLUMN source TEXT DEFAULT 'timer'")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()


# ── Existing helpers ───────────────────────────────────────────────────────

def parse_frontmatter(filepath: Path) -> dict | None:
    try:
        text = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    if not text.strip():
        return None
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return None
    try:
        fm = yaml.safe_load(match.group(1))
        if not isinstance(fm, dict):
            return None
        return fm
    except yaml.YAMLError:
        return None


def days_since(started) -> int | None:
    if started is None:
        return None
    try:
        if isinstance(started, (date, datetime)):
            d = started if isinstance(started, date) else started.date()
        else:
            d = date.fromisoformat(str(started))
        return (date.today() - d).days
    except (ValueError, TypeError):
        return None


def days_until(due) -> int | None:
    if due is None:
        return None
    try:
        if isinstance(due, (date, datetime)):
            d = due if isinstance(due, date) else due.date()
        else:
            d = date.fromisoformat(str(due))
        return (d - date.today()).days
    except (ValueError, TypeError):
        return None


def format_date(d) -> str | None:
    if d is None:
        return None
    try:
        if isinstance(d, (date, datetime)):
            target = d if isinstance(d, date) else d.date()
        else:
            target = date.fromisoformat(str(d))
        return target.strftime("%-d %b %Y")
    except (ValueError, TypeError):
        return None


def load_projects() -> list[dict]:
    if not PROJECTS_PATH.exists():
        return []
    projects = []
    for md_file in PROJECTS_PATH.glob("*.md"):
        if md_file.name.startswith("."):
            continue
        fm = parse_frontmatter(md_file)
        if not fm:
            continue
        if not fm.get("dashboard"):
            continue

        started_raw = fm.get("started")
        due_raw = fm.get("due")

        links = {}
        for key in ("obsidian_note", "claude_project", "drive_folder",
                    "github_repo", "google_doc", "local_file", "url"):
            val = fm.get(key)
            if val and str(val).strip():
                links[key] = str(val).strip()

        project = {
            "id": md_file.stem,
            "title": fm.get("title") or md_file.stem,
            "client": fm.get("client") or "",
            "status": str(fm.get("status", "active")).lower(),
            "started_display": format_date(started_raw),
            "days_in": days_since(started_raw),
            "next_action": fm.get("next_action") or "",
            "due_display": format_date(due_raw),
            "due_days": days_until(due_raw),
            "links": links,
            "modified": md_file.stat().st_mtime,
        }
        projects.append(project)

    projects.sort(key=lambda p: (
        STATUS_ORDER.get(p["status"], 99),
        -p["modified"]
    ))
    return projects


def refresh_cache():
    with _cache_lock:
        _cache["projects"] = load_projects()
        _cache["last_updated"] = datetime.now().isoformat()


class VaultHandler(FileSystemEventHandler):
    def __init__(self):
        self._timer = None

    def _schedule_refresh(self):
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(1.5, refresh_cache)
        self._timer.start()

    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._schedule_refresh()

    def on_created(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._schedule_refresh()

    def on_deleted(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._schedule_refresh()


def start_watcher():
    if not PROJECTS_PATH.exists():
        return
    observer = Observer()
    observer.schedule(VaultHandler(), str(PROJECTS_PATH), recursive=False)
    observer.daemon = True
    observer.start()


# ── Project routes ─────────────────────────────────────────────────────────

@app.route("/projects")
def get_projects():
    with _cache_lock:
        return jsonify({
            "projects": _cache["projects"],
            "last_updated": _cache["last_updated"],
            "vault_path": str(VAULT_PATH),
            "projects_path": str(PROJECTS_PATH),
            "projects_folder_exists": PROJECTS_PATH.exists(),
        })


@app.route("/new-project", methods=["POST"])
def new_project():
    data = request.get_json()
    title = (data.get("title") or "").strip()
    due = (data.get("due") or "").strip()
    if not title:
        return jsonify({"error": "Title required"}), 400

    slug = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "-")
    filepath = PROJECTS_PATH / f"{slug}.md"

    if filepath.exists():
        return jsonify({"error": "A project with this name already exists"}), 409

    PROJECTS_PATH.mkdir(parents=True, exist_ok=True)
    content = PROJECT_TEMPLATE.format(
        title=title,
        today=date.today().isoformat(),
        due=due,
        slug=slug,
    )
    filepath.write_text(content, encoding="utf-8")
    refresh_cache()

    obsidian_url = f"obsidian://open?vault=System&file=Projects/{slug}"
    return jsonify({"ok": True, "obsidian_url": obsidian_url, "slug": slug})


# ── Timer routes ───────────────────────────────────────────────────────────

@app.route("/timer/active")
def timer_active():
    """Return the currently running timer, if any."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    if row:
        return jsonify({"active": True, "entry": dict(row)})
    return jsonify({"active": False, "entry": None})


@app.route("/timer/start", methods=["POST"])
def timer_start():
    """Start a timer for a project. Stops any already-running timer first."""
    data = request.get_json()
    project_id = (data.get("project_id") or "").strip()
    project_title = (data.get("project_title") or "").strip()
    client = (data.get("client") or "").strip()
    task = (data.get("task") or "").strip()

    if not project_id:
        return jsonify({"error": "project_id required"}), 400

    now = datetime.now().isoformat()
    conn = get_db()

    # Auto-stop any running timer
    running = conn.execute(
        "SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if running:
        start_dt = datetime.fromisoformat(running["start_time"])
        duration = (datetime.now() - start_dt).total_seconds()
        conn.execute(
            "UPDATE time_entries SET end_time = ?, duration_secs = ? WHERE id = ?",
            (now, duration, running["id"])
        )

    # Start new timer
    conn.execute(
        "INSERT INTO time_entries (project_id, project_title, client, task, start_time) VALUES (?, ?, ?, ?, ?)",
        (project_id, project_title, client, task, now)
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "started_at": now})


@app.route("/timer/stop", methods=["POST"])
def timer_stop():
    """Stop the currently running timer."""
    now = datetime.now().isoformat()
    conn = get_db()

    running = conn.execute(
        "SELECT * FROM time_entries WHERE end_time IS NULL ORDER BY id DESC LIMIT 1"
    ).fetchone()

    if not running:
        conn.close()
        return jsonify({"ok": False, "error": "No timer running"})

    start_dt = datetime.fromisoformat(running["start_time"])
    duration = (datetime.now() - start_dt).total_seconds()

    conn.execute(
        "UPDATE time_entries SET end_time = ?, duration_secs = ? WHERE id = ?",
        (now, duration, running["id"])
    )
    conn.commit()

    entry = conn.execute("SELECT * FROM time_entries WHERE id = ?", (running["id"],)).fetchone()
    conn.close()

    return jsonify({"ok": True, "entry": dict(entry)})


@app.route("/timer/log")
def timer_log():
    """Return recent time entries. Optional ?project_id= and ?limit= params."""
    project_id = request.args.get("project_id")
    limit = int(request.args.get("limit", 50))

    conn = get_db()
    if project_id:
        rows = conn.execute(
            "SELECT * FROM time_entries WHERE project_id = ? AND end_time IS NOT NULL ORDER BY start_time DESC LIMIT ?",
            (project_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM time_entries WHERE end_time IS NOT NULL ORDER BY start_time DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()

    return jsonify({"entries": [dict(r) for r in rows]})


@app.route("/timer/summary")
def timer_summary():
    """Aggregated time data for the reports view."""
    conn = get_db()

    # Hours by category (project_title = category)
    by_category = conn.execute("""
        SELECT project_title as category, COUNT(*) as entries, ROUND(SUM(duration_secs)/3600, 2) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL
        GROUP BY project_title ORDER BY hours DESC
    """).fetchall()

    # Hours by client (for paying work tracking)
    by_client = conn.execute("""
        SELECT client, COUNT(*) as entries, ROUND(SUM(duration_secs)/3600, 2) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL AND client != ''
        GROUP BY client ORDER BY hours DESC
    """).fetchall()

    # Hours by month
    by_month = conn.execute("""
        SELECT SUBSTR(start_time, 1, 7) as month, ROUND(SUM(duration_secs)/3600, 2) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL
        GROUP BY month ORDER BY month
    """).fetchall()

    # This week (Monday to Sunday)
    today = date.today()
    monday = today - __import__('datetime').timedelta(days=today.weekday())
    week_hours = conn.execute("""
        SELECT COALESCE(ROUND(SUM(duration_secs)/3600, 2), 0) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL AND DATE(start_time) >= ?
    """, (monday.isoformat(),)).fetchone()

    # This month
    month_start = today.replace(day=1)
    month_hours = conn.execute("""
        SELECT COALESCE(ROUND(SUM(duration_secs)/3600, 2), 0) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL AND DATE(start_time) >= ?
    """, (month_start.isoformat(),)).fetchone()

    # Total
    total = conn.execute("""
        SELECT COUNT(*) as entries, COALESCE(ROUND(SUM(duration_secs)/3600, 2), 0) as hours
        FROM time_entries WHERE duration_secs IS NOT NULL
    """).fetchone()

    # Recent entries (last 100)
    recent = conn.execute("""
        SELECT * FROM time_entries WHERE duration_secs IS NOT NULL
        ORDER BY start_time DESC LIMIT 100
    """).fetchall()

    conn.close()

    return jsonify({
        "by_category": [dict(r) for r in by_category],
        "by_client": [dict(r) for r in by_client],
        "by_month": [dict(r) for r in by_month],
        "week_hours": week_hours["hours"],
        "month_hours": month_hours["hours"],
        "total_hours": total["hours"],
        "total_entries": total["entries"],
        "recent": [dict(r) for r in recent],
    })


@app.route("/timer/export")
def timer_export():
    """Export all time entries as CSV."""
    conn = get_db()
    rows = conn.execute("""
        SELECT start_time, client, project_title, task, duration_secs, source
        FROM time_entries WHERE duration_secs IS NOT NULL
        ORDER BY start_time
    """).fetchall()
    conn.close()

    import io
    import csv as csv_mod
    output = io.StringIO()
    writer = csv_mod.writer(output)
    writer.writerow(["Date", "Category", "Client", "Description", "Hours", "Source"])
    for r in rows:
        dt = r["start_time"][:10] if r["start_time"] else ""
        hours = round(r["duration_secs"] / 3600, 2) if r["duration_secs"] else 0
        writer.writerow([dt, r["project_title"], r["client"], r["task"], hours, r["source"]])

    from flask import Response
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=time_report.csv"}
    )


# ── Health & startup ───────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    refresh_cache()
    start_watcher()
    app.run(port=7842, debug=False)
