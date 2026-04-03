from __future__ import annotations

import os
import re
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


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    refresh_cache()
    start_watcher()
    app.run(port=7842, debug=False)
