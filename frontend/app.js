/* ── Helpers ─────────────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const LINK_META = {
  obsidian_note:  { label: "Obsidian",   icon: "◈" },
  claude_project: { label: "Claude",     icon: "◉" },
  drive_folder:   { label: "Drive",      icon: "▲" },
  github_repo:    { label: "GitHub",     icon: "⌥" },
  google_doc:     { label: "Google Doc", icon: "◻" },
  local_file:     { label: "File",       icon: "◫" },
  url:            { label: "URL",        icon: "↗" },
};

function formatDate(display) {
  return display || "—";
}

function daysLabel(n) {
  if (n === null || n === undefined) return "";
  if (n === 0) return "started today";
  if (n === 1) return "1 day in";
  return `${n} days in`;
}

function dueDateLabel(days) {
  if (days === null || days === undefined) return null;
  if (days < 0)  return { text: `${Math.abs(days)}d overdue`, cls: "due-overdue" };
  if (days === 0) return { text: "Due today",   cls: "due-today" };
  if (days <= 7)  return { text: `${days}d left`, cls: "due-soon" };
  return { text: `${days}d left`, cls: "due-ok" };
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── State ───────────────────────────────────────────────────────────── */

let allProjects = [];
let activeFilter = "all";
let activeTimer = null;        // { project_id, start_time, ... } or null
let timerInterval = null;      // setInterval handle for ticking display

/* ── Timer logic ─────────────────────────────────────────────────────── */

async function loadActiveTimer() {
  try {
    if (!window.cc) return;
    const data = await window.cc.getActiveTimer();
    if (data.active && data.entry) {
      activeTimer = data.entry;
      startTickingDisplay();
    } else {
      activeTimer = null;
      stopTickingDisplay();
    }
  } catch (e) {
    console.error("Failed to load active timer:", e);
  }
}

function startTickingDisplay() {
  stopTickingDisplay();
  updateTimerDisplays();
  timerInterval = setInterval(updateTimerDisplays, 1000);
}

function stopTickingDisplay() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplays() {
  // Update the active card's timer display
  $$(".timer-btn").forEach((btn) => {
    const cardId = btn.dataset.projectId;
    const elapsed = btn.querySelector(".timer-elapsed");
    const label = btn.querySelector(".timer-label");

    if (activeTimer && activeTimer.project_id === cardId) {
      const startTime = new Date(activeTimer.start_time).getTime();
      const now = Date.now();
      const secs = Math.floor((now - startTime) / 1000);
      btn.classList.add("running");
      if (elapsed) elapsed.textContent = formatElapsed(secs);
      if (label) label.textContent = "Stop";
    } else {
      btn.classList.remove("running");
      if (elapsed) elapsed.textContent = "";
      if (label) label.textContent = "Start timer";
    }
  });
}

async function handleTimerClick(project) {
  if (!window.cc) return;

  if (activeTimer && activeTimer.project_id === project.id) {
    // Stop timer
    await window.cc.stopTimer();
    activeTimer = null;
    stopTickingDisplay();
    updateTimerDisplays();
  } else {
    // Start timer (auto-stops any running one on backend)
    const result = await window.cc.startTimer(
      project.id,
      project.title,
      project.client || "",
      project.next_action || ""
    );
    if (result.ok) {
      activeTimer = {
        project_id: project.id,
        start_time: result.started_at,
      };
      startTickingDisplay();
    }
  }
}

/* ── Render ──────────────────────────────────────────────────────────── */

function renderCard(p) {
  const badge = `<span class="badge badge-${p.status}">${p.status}</span>`;

  const client = p.client
    ? `<div class="card-client">${p.client}</div>`
    : "";

  const nextText = p.next_action
    ? p.next_action
    : "";
  const nextClass = p.next_action ? "" : " empty";
  const nextContent = p.next_action || "No next action set";

  const dueInfo = dueDateLabel(p.due_days);
  const dueBlock = (p.due_display && dueInfo) ? `
    <div class="due-row">
      <span class="field-label">Due</span>
      <span class="due-date">${p.due_display}</span>
      <span class="due-badge ${dueInfo.cls}">${dueInfo.text}</span>
    </div>` : "";

  const links = Object.entries(p.links || {})
    .map(([key, url]) => {
      const meta = LINK_META[key] || { label: key, icon: "↗" };
      return `<button class="link-pill" data-url="${url}">
        <span class="pill-icon">${meta.icon}</span>${meta.label}
      </button>`;
    })
    .join("");

  const isRunning = activeTimer && activeTimer.project_id === p.id;
  const timerBtnClass = isRunning ? "timer-btn running" : "timer-btn";
  let elapsedText = "";
  if (isRunning) {
    const startTime = new Date(activeTimer.start_time).getTime();
    const secs = Math.floor((Date.now() - startTime) / 1000);
    elapsedText = formatElapsed(secs);
  }

  const timerButton = `
    <button class="${timerBtnClass}" data-project-id="${p.id}">
      <span class="timer-icon">${isRunning ? "◼" : "▶"}</span>
      <span class="timer-label">${isRunning ? "Stop" : "Start timer"}</span>
      <span class="timer-elapsed">${elapsedText}</span>
    </button>`;

  return `
    <div class="card" data-status="${p.status}">
      <div class="card-head">
        <div>
          <div class="card-title">${p.title}</div>
          ${client}
        </div>
        ${badge}
      </div>

      <div class="next-section">
        <span class="field-label">Next action</span>
        <div class="next-text${nextClass}">${nextContent}</div>
      </div>

      <div class="meta-row">
        <div class="meta-item">
          <span class="field-label">Started</span>
          <div class="meta-value">${formatDate(p.started_display)}</div>
          <div class="meta-sub">${daysLabel(p.days_in)}</div>
        </div>
        ${p.client ? `
        <div class="meta-item">
          <span class="field-label">Client</span>
          <div class="meta-value">${p.client}</div>
        </div>` : ""}
      </div>

      ${dueBlock}

      <div class="card-footer">
        ${links ? `<div class="links-row">${links}</div>` : ""}
        ${timerButton}
      </div>
    </div>
  `;
}

function renderGrid(projects) {
  const grid = $("#cards-grid");
  const filtered = activeFilter === "all"
    ? projects
    : projects.filter((p) => p.status === activeFilter);

  if (filtered.length === 0) {
    const msg = activeFilter === "all"
      ? "No projects found. Create your first one →"
      : `No ${activeFilter} projects.`;
    grid.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join("");

  // Wire up link pills
  grid.querySelectorAll(".link-pill[data-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.url;
      if (window.cc) {
        window.cc.openUrl(url);
      } else {
        window.open(url, "_blank");
      }
    });
  });

  // Wire up timer buttons
  grid.querySelectorAll(".timer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const projectId = btn.dataset.projectId;
      const project = allProjects.find((p) => p.id === projectId);
      if (project) handleTimerClick(project);
    });
  });
}

function updateStats(projects) {
  const count = (s) => projects.filter((p) => p.status === s).length;
  $("#s-total").textContent   = projects.length;
  $("#s-active").textContent  = count("active");
  $("#s-waiting").textContent = count("waiting");
  $("#s-paused").textContent  = count("paused");
}

/* ── Data loading ────────────────────────────────────────────────────── */

async function loadProjects() {
  try {
    let data;
    if (window.cc) {
      data = await window.cc.fetchProjects();
    } else {
      // Dev fallback — use mock data when running outside Electron
      data = { projects: MOCK_PROJECTS, last_updated: new Date().toISOString() };
    }

    allProjects = data.projects || [];
    updateStats(allProjects);
    renderGrid(allProjects);

    if (data.last_updated) {
      const d = new Date(data.last_updated);
      $("#last-updated").textContent = `updated ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  } catch (e) {
    $("#cards-grid").innerHTML = `<div class="empty-state">Could not connect to backend — is it running?</div>`;
    console.error(e);
  }
}

/* ── Date display ────────────────────────────────────────────────────── */

function updateDate() {
  const now = new Date();
  const day = now.toLocaleDateString("en-CA", { weekday: "long" });
  const date = now.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
  $("#sidebar-date").innerHTML = `${day}<br>${date}`;
}

/* ── Filter tabs ─────────────────────────────────────────────────────── */

$("#filter-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  $$(".tab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  activeFilter = tab.dataset.filter;
  renderGrid(allProjects);
});

/* ── App launcher ────────────────────────────────────────────────────── */

$$(".app-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (window.cc) {
      if (btn.dataset.app) {
        window.cc.launchApp(btn.dataset.app);
      } else if (btn.dataset.url) {
        window.cc.openUrl(btn.dataset.url);
      }
    } else {
      if (btn.dataset.url) window.open(btn.dataset.url, "_blank");
    }
  });
});

/* ── Refresh ─────────────────────────────────────────────────────────── */

$("#refresh-btn").addEventListener("click", () => {
  $("#refresh-btn").style.opacity = "0.4";
  loadProjects().finally(() => {
    setTimeout(() => ($("#refresh-btn").style.opacity = ""), 400);
  });
});

/* ── New project modal ───────────────────────────────────────────────── */

const backdrop = $("#modal-backdrop");
const titleInput = $("#new-title");
const dueInput = $("#new-due");
const confirmBtn = $("#modal-confirm");

$("#new-project-btn").addEventListener("click", () => {
  titleInput.value = "";
  dueInput.value = "";
  backdrop.classList.add("open");
  setTimeout(() => titleInput.focus(), 50);
});

$("#modal-cancel").addEventListener("click", () => {
  backdrop.classList.remove("open");
});

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) backdrop.classList.remove("open");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") backdrop.classList.remove("open");
  if (e.key === "Enter" && backdrop.classList.contains("open")) {
    confirmBtn.click();
  }
});

confirmBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  if (!title) return;

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Creating…";

  if (window.cc) {
    const result = await window.cc.newProject(title, dueInput.value || "");
    if (result.error) {
      alert(result.error);
    } else {
      backdrop.classList.remove("open");
      setTimeout(loadProjects, 800); // Give Obsidian a moment to open
    }
  } else {
    // Dev mode — just close
    backdrop.classList.remove("open");
  }

  confirmBtn.disabled = false;
  confirmBtn.textContent = "Create & open in Obsidian";
});

/* ── Mock data for browser-only dev ─────────────────────────────────── */

const MOCK_PROJECTS = [
  {
    id: "dashboard-builder", title: "Dashboard builder", client: "",
    status: "active", started_display: "28 Mar 2026", days_in: 3,
    next_action: "Build Electron + Flask skeleton and test app launcher buttons",
    links: { obsidian_note: "#", claude_project: "#" }
  },
  {
    id: "eqao-report", title: "EQAO conference report", client: "EQAO",
    status: "active", started_display: "18 Feb 2026", days_in: 41,
    next_action: "Review presentation slides and update findings section",
    links: { obsidian_note: "#", drive_folder: "#", url: "#" }
  },
  {
    id: "website-redesign", title: "Client website redesign", client: "Acme Corp",
    status: "waiting", started_display: "15 Jan 2026", days_in: 75,
    next_action: "Waiting on client approval — follow up if no reply by April 3",
    links: { obsidian_note: "#", github_repo: "#", drive_folder: "#" }
  },
  {
    id: "research-tool", title: "Research synthesis tool", client: "",
    status: "paused", started_display: "3 Dec 2025", days_in: 119,
    next_action: "Revisit once dashboard project is shipped",
    links: { obsidian_note: "#", claude_project: "#", github_repo: "#" }
  },
];

/* ── View switching ─────────────────────────────────────────────────── */

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const view = btn.dataset.view;
    $("#view-projects").classList.toggle("hidden", view !== "projects");
    $("#view-reports").classList.toggle("hidden", view !== "reports");

    if (view === "reports") loadReports();
  });
});

/* ── Reports ──────────────────────────────────────────────────────────── */

function renderBarChart(container, data, labelKey, valueKey) {
  const maxVal = Math.max(...data.map((d) => d[valueKey]), 1);
  container.innerHTML = data
    .map((d) => {
      const pct = (d[valueKey] / maxVal) * 100;
      const label = d[labelKey] || "(none)";
      return `
        <div class="bar-row">
          <span class="bar-label" title="${label}">${label}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="bar-value">${d[valueKey]}h</span>
        </div>`;
    })
    .join("");
}

function formatMonthLabel(ym) {
  // "2025-07" → "Jul 2025"
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function renderReportTable(entries) {
  const tbody = $("#report-table-body");
  tbody.innerHTML = entries
    .map((e) => {
      const dt = e.start_time ? e.start_time.slice(0, 10) : "";
      const hours = e.duration_secs ? (e.duration_secs / 3600).toFixed(1) : "0";
      const srcClass = e.source === "timer" ? "source-timer" : e.source === "manual" ? "source-manual" : "source-import";
      return `
        <tr>
          <td>${dt}</td>
          <td>${e.project_title || ""}</td>
          <td>${e.client || ""}</td>
          <td>${e.task || ""}</td>
          <td class="col-hours">${hours}</td>
          <td><span class="source-badge ${srcClass}">${e.source || ""}</span></td>
        </tr>`;
    })
    .join("");
}

async function loadReports() {
  try {
    const res = await fetch("http://localhost:7842/timer/summary");
    const data = await res.json();

    // Summary cards
    $("#r-total-hours").textContent = data.total_hours;
    $("#r-month-hours").textContent = data.month_hours;
    $("#r-week-hours").textContent = data.week_hours;
    $("#r-total-entries").textContent = data.total_entries;

    // Bar charts
    renderBarChart($("#chart-by-category"), data.by_category, "category", "hours");

    // Update known categories for the manual entry autocomplete
    knownCategories = data.by_category.map((d) => d.category).filter(Boolean);

    renderBarChart($("#chart-by-client"), data.by_client, "client", "hours");

    // Hide client panel if no client data
    const clientPanel = $("#client-panel");
    if (data.by_client.length === 0) {
      clientPanel.style.display = "none";
    } else {
      clientPanel.style.display = "";
    }

    const monthData = data.by_month.map((d) => ({
      ...d,
      label: formatMonthLabel(d.month),
    }));
    renderBarChart($("#chart-by-month"), monthData, "label", "hours");

    // Table
    renderReportTable(data.recent);
  } catch (e) {
    console.error("Failed to load reports:", e);
  }
}

/* ── Manual entry modal ───────────────────────────────────────────── */

const entryBackdrop = $("#entry-modal-backdrop");
const entryCategory = $("#entry-category");
const entryClient = $("#entry-client");
const entryDescription = $("#entry-description");
const entryDate = $("#entry-date");
const entryHours = $("#entry-hours");
const entryConfirmBtn = $("#entry-modal-confirm");

let knownCategories = [];

$("#add-entry-btn").addEventListener("click", () => {
  // Set date to today
  entryDate.value = new Date().toISOString().slice(0, 10);
  entryCategory.value = "";
  entryClient.value = "";
  entryDescription.value = "";
  entryHours.value = "";

  // Populate category datalist from known categories
  const datalist = $("#category-list");
  datalist.innerHTML = knownCategories
    .map((c) => `<option value="${c}">`)
    .join("");

  entryBackdrop.classList.add("open");
  setTimeout(() => entryCategory.focus(), 50);
});

$("#entry-modal-cancel").addEventListener("click", () => {
  entryBackdrop.classList.remove("open");
});

entryBackdrop.addEventListener("click", (e) => {
  if (e.target === entryBackdrop) entryBackdrop.classList.remove("open");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && entryBackdrop.classList.contains("open")) {
    entryBackdrop.classList.remove("open");
  }
});

entryConfirmBtn.addEventListener("click", async () => {
  const category = entryCategory.value.trim();
  const client = entryClient.value.trim();
  const description = entryDescription.value.trim();
  const dateVal = entryDate.value;
  const hours = entryHours.value;

  if (!category) { entryCategory.focus(); return; }
  if (!dateVal) { entryDate.focus(); return; }
  if (!hours || parseFloat(hours) <= 0) { entryHours.focus(); return; }

  entryConfirmBtn.disabled = true;
  entryConfirmBtn.textContent = "Adding…";

  try {
    const res = await fetch("http://localhost:7842/timer/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, client, description, date: dateVal, hours: parseFloat(hours) }),
    });
    const data = await res.json();

    if (data.error) {
      alert(data.error);
    } else {
      entryBackdrop.classList.remove("open");
      loadReports(); // Refresh the reports view
    }
  } catch (err) {
    console.error("Failed to add manual entry:", err);
    alert("Failed to add entry. Is the backend running?");
  }

  entryConfirmBtn.disabled = false;
  entryConfirmBtn.textContent = "Add entry";
});

/* ── CSV export ───────────────────────────────────────────────────────── */

$("#export-csv-btn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = "http://localhost:7842/timer/export";
  link.download = "time_report.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/* ── Init ─────────────────────────────────────────────────────────────── */

updateDate();
loadProjects();
loadActiveTimer();
setInterval(loadProjects, 30000); // Refresh every 30 seconds
