"""
Reimport corrected CSV back into the database, updating existing entries by ID.

Usage:
    python3 reimport_fixed.py imported_entries_review.csv

The CSV must have these columns:
    id, Date, Category, Client, Description, Hours, Source

This updates each row in the database by matching on the 'id' column.
Only entries with source='import' are touched.
"""

from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "timetracker.db"


def reimport(csv_path: str):
    conn = sqlite3.connect(str(DB_PATH))

    updated = 0
    skipped = 0
    errors = 0

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row_num, row in enumerate(reader, start=2):
            entry_id = row.get("id", "").strip()
            if not entry_id:
                skipped += 1
                continue

            try:
                entry_id = int(entry_id)
            except ValueError:
                print(f"  Row {row_num}: invalid id '{row.get('id')}' -- skipped")
                errors += 1
                continue

            category = (row.get("Category") or "").strip()
            client = (row.get("Client") or "").strip()
            description = (row.get("Description") or "").strip()

            project_id = category.lower().replace(" ", "-") if category else "unknown"

            conn.execute(
                """UPDATE time_entries
                   SET project_id = ?, project_title = ?, client = ?, task = ?
                   WHERE id = ? AND source = 'import'""",
                (project_id, category, client, description, entry_id)
            )
            updated += 1

    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM time_entries WHERE source = 'import'").fetchone()[0]
    conn.close()

    print(f"\n{'='*50}")
    print(f"  Reimport complete")
    print(f"  Updated:  {updated} entries")
    print(f"  Skipped:  {skipped}")
    print(f"  Errors:   {errors}")
    print(f"  Imported entries in DB: {total}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 reimport_fixed.py <corrected_csv_file>")
        sys.exit(1)

    csv_file = sys.argv[1]
    print(f"Reimporting from: {csv_file}")
    print(f"Database:         {DB_PATH}")
    reimport(csv_file)
