const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const BACKEND_PORT = 7842;
let mainWindow = null;
let pythonProcess = null;

// ── Python backend ────────────────────────────────────────────────────────

function startBackend() {
  const backendPath = path.join(__dirname, "backend", "server.py");
  const venvPython = path.join(__dirname, "backend", "venv", "bin", "python3");
  const systemPython = "/usr/bin/python3";
  const pythonBin = fs.existsSync(venvPython) ? venvPython : systemPython;

  pythonProcess = spawn(pythonBin, [backendPath], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pythonProcess.stdout.on("data", (d) => console.log("[python]", d.toString().trim()));
  pythonProcess.stderr.on("data", (d) => console.error("[python]", d.toString().trim()));
  pythonProcess.on("close", (code) => console.log("[python] exited", code));
}

function waitForBackend(retries = 20) {
  return new Promise((resolve, reject) => {
    const try_ = (n) => {
      fetch(`http://localhost:${BACKEND_PORT}/health`)
        .then((r) => r.ok ? resolve() : retry(n))
        .catch(() => retry(n));
    };
    const retry = (n) => {
      if (n <= 0) return reject(new Error("Backend did not start"));
      setTimeout(() => try_(n - 1), 300);
    };
    try_(retries);
  });
}

// ── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",   // native Mac traffic lights
    vibrancy: "under-window",       // frosted glass Mac effect
    title: "Command Centre",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "frontend", "index.html"));
}

// ── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
  } catch (e) {
    console.error("Backend failed to start:", e.message);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (pythonProcess) pythonProcess.kill();
});

// ── IPC handlers (called from frontend via preload) ───────────────────────

// Open any URL or app URI (obsidian://, https://, etc.)
ipcMain.handle("open-url", async (_, url) => {
  await shell.openExternal(url);
});

// Launch Mac apps by name
ipcMain.handle("launch-app", async (_, appName) => {
  const { exec } = require("child_process");
  return new Promise((resolve) => {
    exec(`open -a "${appName}"`, (err) => {
      resolve(err ? { ok: false, error: err.message } : { ok: true });
    });
  });
});

// Create new project note via backend
ipcMain.handle("new-project", async (_, title, due = "") => {
  try {
    const res = await fetch(`http://localhost:${BACKEND_PORT}/new-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, due }),
    });
    const data = await res.json();
    if (data.obsidian_url) {
      await shell.openExternal(data.obsidian_url);
    }
    return data;
  } catch (e) {
    return { error: e.message };
  }
});
