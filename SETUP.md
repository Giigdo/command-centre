# Command Centre — Setup Guide

## Prerequisites
- Node.js (https://nodejs.org — LTS version)
- Python 3.11+ (comes with macOS, or via brew)
- Obsidian installed (for deep links to work)

---

## 1. Create your Projects folder in Obsidian

In Finder, create this folder:
  /Users/amcconnell/My Drive/DriveSyncFiles/System/Projects/

Or create it from inside Obsidian — just make a folder called "Projects" at the root of your vault.

---

## 2. Install Python dependencies

Open Terminal and run:

  cd ~/command-centre
  npm run setup-python

This creates a local Python virtual environment inside the app folder and installs Flask, watchdog, and PyYAML.

---

## 3. Install Electron

In the same Terminal:

  cd ~/command-centre
  npm install

---

## 4. Run the app

  npm start

The dashboard window will appear. The Python backend starts automatically in the background.

---

## 5. Create your first project

Click "+ New project" in the bottom-left of the dashboard.
Type a project name and press Enter.
The note will be created in your Projects folder and opened in Obsidian.

Fill in the YAML fields in Obsidian:
- status: active | waiting | paused | complete
- client: (leave blank for personal projects)
- next_action: what you need to do next
- started: YYYY-MM-DD format
- Add any tool links (claude_project, drive_folder, github_repo, url)

Save the note — the dashboard refreshes automatically within 2 seconds.

---

## Project YAML template (for existing notes)

Add this frontmatter to any existing Obsidian note to surface it on the dashboard:

---
dashboard: true
title: "Your Project Name"
client: ""
status: active
started: 2026-01-01
next_action: "What you need to do next"
obsidian_note: "obsidian://open?vault=System&file=Projects/your-note-name"
claude_project: ""
drive_folder: ""
github_repo: ""
url: ""
---

Only notes inside the Projects/ folder with dashboard: true will appear.

---

## Auto-start on login (optional)

To have Command Centre open automatically when you log into your Mac:

1. Open System Settings → General → Login Items
2. Click + and navigate to your command-centre folder
3. Select the app (once you've built it with electron-builder)

For now, just run `npm start` from Terminal when you want it open.

---

## Vault path

The default vault path is:
  /Users/amcconnell/My Drive/DriveSyncFiles/System

To change it, set the VAULT_PATH environment variable before starting:
  VAULT_PATH="/path/to/your/vault" npm start

---

## Troubleshooting

Dashboard shows "Could not connect to backend":
→ Check Terminal for Python errors
→ Make sure Python 3 is installed: `python3 --version`
→ Run setup-python again: `npm run setup-python`

App launcher buttons don't work:
→ Check the exact app names in /Applications and ~/Applications
→ Outlook PWA name may vary — check System Settings → Login Items to see the exact name

Obsidian deep links don't open the right note:
→ Make sure your vault name in Obsidian exactly matches "System"
→ Check Obsidian → Settings → About → Vault name
