"""
Import Google Sheets hour tracking CSV into the Command Centre SQLite database.

Usage:
    python3 import_hours.py /path/to/Hours_Tracking.csv

This maps the sheet columns to time_entries as follows:
    Meeting date  → start_time (ISO format), end_time (start + hours)
    Category      → client
    Description   → project_id (slugified) and project_title
    Number of Hours → duration_secs (hours × 3600)
    notes         → stored in task field alongside description
    source        → 'import' (to distinguish from live timer entries)

Entries with Status = "Postponed" or missing hours are skipped.
Duplicate detection: skips rows where the same project_id + start_time already exists.
"""

from __future__ import annotations

import csv
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path


def slugify(text: str) -> str:
    """Convert a title to a URL-friendly slug."""
    return re.sub(r"[^\w\s-]", "", text).strip().lower().replace(" ", "-")


def parse_date(date_str: str) -> datetime | None:
    """Parse the sheet's date format: M/D/YYYY H:MM:SS"""
    date_str = date_str.strip()
    if not date_str:
        return None
    for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def import_csv(csv_path: str, db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Ensure source column exists
    try:
        conn.execute("ALTER TABLE time_entries ADD COLUMN source TEXT DEFAULT 'timer'")
    except sqlite3.OperationalError:
        pass

    imported = 0
    skipped = 0
    errors = 0

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_num, row in enumerate(reader, start=2):
            # Skip postponed entries
            status = (row.get("Status") or "").strip()
            if status.lower() == "postponed":
                skipped += 1
                continue

            # Parse hours
            hours_str = (row.get("Number of Hours") or "").strip()
            if not hours_str:
                skipped += 1
                continue
            try:
                hours = float(hours_str)
            except ValueError:
                print(f"  Row {row_num}: invalid hours '{hours_str}' -- skipped")
                errors += 1
                continue

            # Parse date
            date_str = (row.get("Meeting date") or "").strip()
            start_dt = parse_date(date_str)
            if not start_dt:
                print(f"  Row {row_num}: invalid date '{date_str}' -- skipped")
                errors += 1
                continue

            # Build fields
            description = (row.get("Description") or "").strip()
            category = (row.get("Category") or "").strip()
            notes = (row.get("notes") or "").strip()

            project_id = slugify(description) if description else "unknown"
            project_title = description or "Unknown"
            client = category
            task = description
            if notes:
                task = f"{description} -- {notes}"

            start_time = start_dt.isoformat()
            end_dt = start_dt + timedelta(hours=hours)
            end_time = end_dt.isoformat()
            duration_secs = hours * 3600

            # Duplicate check: same project_id and start_time
            existing = conn.execute(
                "SELECT id FROM time_entries WHERE project_id = ? AND start_time = ?",
                (project_id, start_time)
            ).fetchone()
            if existing:
                skipped += 1
                continue

            conn.execute(
                """INSERT INTO time_entries
                   (project_id, project_title, client, task, start_time, end_time, duration_secs, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'import')""",
                (project_id, project_title, client, task, start_time, end_time, duration_secs)
            )
            imported += 1

    conn.commit()

    # Show summary
    total = conn.execute("SELECT COUNT(*) FROM time_entries").fetchone()[0]
    total_hours = conn.execute("SELECT SUM(duration_secs) FROM time_entries WHERE duration_secs IS NOT NULL").fetchone()[0]
    conn.close()

    print(f"\n{'='*50}")
    print(f"  Import complete")
    print(f"  Imported:  {imported} entries")
    print(f"  Skipped:   {skipped} (duplicates, postponed, or missing hours)")
    print(f"  Errors:    {errors}")
    print(f"  DB total:  {total} entries")
    if total_hours:
        print(f"  Total hrs: {total_hours / 3600:.1f}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 import_hours.py <csv_file> [db_file]")
        print("  db_file defaults to backend/timetracker.db in the same directory")
        sys.exit(1)

    csv_file = sys.argv[1]
    if len(sys.argv) >= 3:
        db_file = sys.argv[2]
    else:
        # Default: same directory as this script's parent / backend / timetracker.db
        db_file = str(Path(__file__).parent / "timetracker.db")

    print(f"Importing from: {csv_file}")
    print(f"Database:       {db_file}")
    import_csv(csv_file, db_file)
