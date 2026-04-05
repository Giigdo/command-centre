const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cc", {
  openUrl:    (url)   => ipcRenderer.invoke("open-url", url),
  launchApp:  (name)  => ipcRenderer.invoke("launch-app", name),
  newProject: (title, due) => ipcRenderer.invoke("new-project", title, due),
  fetchProjects: () =>
    fetch("http://localhost:7842/projects").then((r) => r.json()),

  // Timer
  startTimer: (projectId, projectTitle, client, task) =>
    fetch("http://localhost:7842/timer/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, project_title: projectTitle, client: client, task: task }),
    }).then((r) => r.json()),

  stopTimer: () =>
    fetch("http://localhost:7842/timer/stop", { method: "POST" }).then((r) => r.json()),

  getActiveTimer: () =>
    fetch("http://localhost:7842/timer/active").then((r) => r.json()),

  // Reports
  getTimerLog: (projectId, limit) => {
    let url = "http://localhost:7842/timer/log";
    const params = [];
    if (projectId) params.push(`project_id=${encodeURIComponent(projectId)}`);
    if (limit) params.push(`limit=${limit}`);
    if (params.length) url += "?" + params.join("&");
    return fetch(url).then((r) => r.json());
  },
});
