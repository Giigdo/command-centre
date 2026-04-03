const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cc", {
  openUrl:    (url)   => ipcRenderer.invoke("open-url", url),
  launchApp:  (name)  => ipcRenderer.invoke("launch-app", name),
  newProject: (title, due) => ipcRenderer.invoke("new-project", title, due),
  fetchProjects: () =>
    fetch("http://localhost:7842/projects").then((r) => r.json()),
});
