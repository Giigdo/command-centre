# Command Centre

A personal project management dashboard built with Electron, Python, and Obsidian. Command Centre reads YAML frontmatter from your Obsidian vault and displays your projects as live, colour-coded cards — each with status tracking, day counts, due dates, and one-click links to all your tools and files.

## What It Does

Command Centre gives you a single window where you can see everything you're working on at a glance. It watches your Obsidian vault for changes and updates the dashboard automatically within seconds of saving a note.

**Project cards display:**

- Project title and client name
- Colour-coded status badge (active, waiting, paused, complete) with a matching left border
- Next action — what you need to do next
- Start date with a running day count
- Due date badge (green / amber / red based on urgency)
- Clickable link pills for: Obsidian note, Claude project, Google Drive folder, GitHub repo, Google Doc, local file, and web URL

**App launcher sidebar** with buttons for Obsidian, Claude, Google Chrome, Outlook, Gmail, and Google Drive — so you can switch between your key tools without leaving the dashboard.

**New project button** that creates a pre-filled Obsidian note from a template and opens it directly in your vault.

## Architecture

```
~/command-centre/
├── backend/
│   ├── server.py            ← Python/Flask — reads vault, serves JSON
│   └── requirements.txt
├── frontend/
│   ├── index.html           ← Dashboard UI
│   ├── style.css
│   └── app.js
├── main.js                  ← Electron entry point
├── preload.js               ← Electron preload script
└── package.json
```

The Python backend reads your Obsidian vault's `Projects` subfolder, parses YAML frontmatter from each markdown file, and serves it as JSON on `localhost:7842`. A file watcher (using `watchdog`) detects changes and refreshes the cache automatically. Electron wraps the frontend in a native Mac window and manages the Python process lifecycle — starting it on launch and stopping it on quit.

## Prerequisites

### Homebrew

If you don't have Homebrew, install it first:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js

```bash
brew install node
```

Or download the LTS version from [nodejs.org](https://nodejs.org).

### Python 3

macOS includes Python 3 via Xcode Command Line Tools. Check with:

```bash
python3 --version
```

If not installed:

```bash
xcode-select --install
```

### Obsidian

Obsidian must be installed and running with your vault open. The dashboard uses `obsidian://` deep links to open project notes directly, and the backend reads from your vault's file system.

Download from [obsidian.md](https://obsidian.md).

## Installation

1. **Clone the repo:**

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/command-centre.git
cd command-centre
```

2. **Install Electron and Node dependencies:**

```bash
npm install
```

3. **Set up the Python virtual environment and install dependencies:**

```bash
npm run setup-python
```

This creates a `venv` inside `backend/` and installs the required Python packages.

## Python Dependencies

Installed automatically by `npm run setup-python`. Defined in `backend/requirements.txt`:

| Package | Purpose |
|---|---|
| `flask` | Lightweight web server — serves project data as JSON |
| `flask-cors` | Enables cross-origin requests between Electron and Flask |
| `pyyaml` | Parses YAML frontmatter from Obsidian markdown files |
| `watchdog` | Watches the vault folder for file changes and triggers cache refresh |

## Configuration

The backend expects your Obsidian vault at a specific path. Update the `VAULT_PATH` in `backend/server.py` to match your system:

```python
VAULT_PATH = Path(os.environ.get(
    "VAULT_PATH",
    "/Users/YOUR_USERNAME/My Drive/DriveSyncFiles/System"
))
```

The vault must contain a `Projects` subfolder. Only markdown files inside `Projects/` with `dashboard: true` in their YAML frontmatter will appear on the dashboard.

## Usage

```bash
cd ~/command-centre
npm start
```

Electron opens the dashboard window and starts the Python backend automatically. The dashboard refreshes every 30 seconds and reacts to file changes within about 2 seconds.

To stop: press `Ctrl+C` in the Terminal, or close the Electron window.

## Project Note Format

Each project is an Obsidian markdown file with YAML frontmatter. Here's the full template:

```yaml
---
dashboard: true
title: "Your Project Name"
client: "Client Name"
status: active
started: 2026-01-15
due: 2026-06-01
next_action: "What you need to do next"
obsidian_note: "obsidian://open?vault=System&file=Projects/your-project"
claude_project: "https://claude.ai/project/..."
drive_folder: "https://drive.google.com/drive/folders/..."
github_repo: "https://github.com/username/repo"
google_doc: "https://docs.google.com/document/d/..."
local_file: "file:///Users/username/path/to/file.docx"
url: "https://www.example.com"
---

## Notes

Your project notes go here.
```

**Required fields:** `dashboard: true`, `title`, `status`, `started`

**Status values:** `active`, `waiting`, `paused`, `complete`

**Date fields:** Use ISO format (`YYYY-MM-DD`). The `started` field drives the day counter. The `due` field shows a colour-coded badge — green (plenty of time), amber (approaching), red (overdue).

**Link fields:** All optional. Each populated link field appears as a clickable pill on the project card.

## Notes

- **Python 3.9 compatibility:** The codebase uses `from __future__ import annotations` to support older Python versions that ship with macOS.
- **Google Drive sync:** If your vault is synced via Google Drive for Desktop, the backend handles Drive sync lock files gracefully.
- **Obsidian Linter plugin:** If you use the Linter plugin, disable the "auto update frontmatter title" setting — it can silently overwrite your project titles on save.

## License

MIT
