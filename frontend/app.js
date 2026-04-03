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

/* ── State ───────────────────────────────────────────────────────────── */

let allProjects = [];
let activeFilter = "all";

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
      ${links ? `<div class="links-row">${links}</div>` : ""}
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

/* ── Init ─────────────────────────────────────────────────────────────── */

updateDate();
loadProjects();
setInterval(loadProjects, 30000); // Refresh every 30 seconds
