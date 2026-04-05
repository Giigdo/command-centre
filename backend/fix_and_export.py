"""
Fix imported entries: swap client → project_title (category) and project_title → task (description).
Then export all imported entries as a CSV for manual review.

Usage:
    python3 fix_and_export.py

This script:
1. For all entries with source='import':
   - Moves client → project_title (category)
   - Moves project_title → task (description)
   - Clears client (since the old sheet didn't have a real client field)
2. Exports all imported entries to imported_entries_review.csv for manual correction
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "timetracker.db"


def fix_imported():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Get all imported entries
    rows = conn.execute(
        "SELECT id, project_id, project_title, client, task FROM time_entries WHERE source = 'import'"
    ).fetchall()

    print(f"Found {len(rows)} imported entries to fix.\n")

    fixed = 0
    for r in rows:
        old_project_title = r["project_title"]  # This is actually the description
        old_client = r["client"]                 # This is actually the category
        old_task = r["task"]

        # New mapping:
        #   project_title (category) ← old client (PhD, Moccasin ID, etc.)
        #   task (description) ← old project_title (Prototype testing, etc.)
        #   project_id ← slugified version of new project_title
        #   client ← cleared (old sheet didn't track real clients)

        new_project_title = old_client if old_client else old_project_title
        new_task = old_project_title
        new_client = ""  # No real client data in old sheet
        new_project_id = new_project_title.lower().replace(" ", "-")

        conn.execute(
            """UPDATE time_entries
               SET project_id = ?, project_title = ?, client = ?, task = ?
               WHERE id = ?""",
            (new_project_id, new_project_title, new_client, new_task, r["id"])
        )
        fixed += 1

    conn.commit()
    print(f"Fixed {fixed} entries.\n")

    # Now export all imported entries for review
    import csv
    rows = conn.execute(
        """SELECT id, start_time, project_title, client, task, duration_secs, source
           FROM time_entries WHERE source = 'import'
           ORDER BY start_time"""
    ).fetchall()

    csv_path = Path(__file__).parent / "imported_entries_review.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "Date", "Category", "Client", "Description", "Hours", "Source"])
        for r in rows:
            dt = r["start_time"][:10] if r["start_time"] else ""
            hours = round(r["duration_secs"] / 3600, 2) if r["duration_secs"] else 0
            writer.writerow([r["id"], dt, r["project_title"], r["client"], r["task"], hours, r["source"]])

    conn.close()

    print(f"Exported {len(rows)} entries to: {csv_path}")
    print(f"\nEdit the CSV to fix any remaining issues, then run:")
    print(f"  python3 reimport_fixed.py imported_entries_review.csv")


if __name__ == "__main__":
    fix_imported()
