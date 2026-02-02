/**
 * PHI Access Logs — list from backend GET /logs only.
 */
import { API_BASE } from "./config.js";

const session = localStorage.getItem("mockSession");
if (!session) {
  window.location.href = "../index.html";
}

try {
  const s = JSON.parse(session || "{}");
  const el = document.getElementById("sidebar-username");
  if (el && s.username) el.textContent = s.username.split("@")[0] || "User";
} catch (_) {}

const logsTbody = document.getElementById("logs-tbody");
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const exportBtn = document.querySelector(".export-btn") as HTMLButtonElement;
const clearLogsBtn = document.getElementById("clear-logs-btn") as HTMLButtonElement;
const logoutLink = document.querySelector('a[href="../index.html"]') as HTMLAnchorElement;

logoutLink?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("mockSession");
  window.location.href = "../index.html";
});

const riskMap: Record<string, { label: string; class: string }> = {
  high: { label: "High", class: "high" },
  medium: { label: "Medium", class: "med" },
  moderate: { label: "Moderate", class: "moderate" },
  low: { label: "Low", class: "low" },
  safe: { label: "Safe", class: "safe" },
  severe: { label: "Severe", class: "severe" },
  critical: { label: "Critical", class: "severe" },
};

interface LogRow {
  id: string;
  timestamp: string;
  user_id: string;
  patient_id: string;
  query?: string;
  risk_severity: string;
}

function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function userDisplay(userId: string): string {
  if (!userId) return "—";
  const part = userId.split("@")[0] || "";
  if (part.toLowerCase().includes("doctor")) return "Dr. " + part.replace(/doctor/gi, "").trim();
  return part.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || userId;
}

let allLogs: LogRow[] = [];

function renderLogs(logs: LogRow[], filter?: string): void {
  if (!logsTbody) return;
  logsTbody.innerHTML = "";
  let list = logs;
  if (filter && filter.trim()) {
    const q = filter.trim().toLowerCase();
    list = list.filter((l) => (l.user_id + l.patient_id + (l.query || "")).toLowerCase().includes(q));
  }
  if (list.length === 0) {
    logsTbody.innerHTML = '<div class="row empty-row"><div>No logs</div></div>';
    return;
  }
  list.forEach((log) => {
    const risk = riskMap[log.risk_severity?.toLowerCase()] || { label: log.risk_severity || "—", class: "low" };
    const row = document.createElement("div");
    row.className = "row clickable";
    row.setAttribute("data-log-id", log.id);
    row.innerHTML = `
      <div>${formatTimestamp(log.timestamp)}</div>
      <div>${userDisplay(log.user_id)}</div>
      <div>${log.patient_id || "—"}</div>
      <div><span class="risk-badge ${risk.class}">${risk.label}</span></div>
      <div>${(log.query || "").slice(0, 60)}${(log.query || "").length > 60 ? "…" : ""}</div>
    `;
    row.addEventListener("click", () => {
      window.location.href = `log-details.html?id=${log.id}`;
    });
    logsTbody.appendChild(row);
  });
}

async function loadLogs(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error(res.statusText);
    allLogs = await res.json();
    renderLogs(allLogs);
  } catch (e) {
    console.error("Load logs error:", e);
    if (logsTbody) logsTbody.innerHTML = '<div class="row empty-row"><div>Failed to load logs. Is the backend running?</div></div>';
  }
}

searchInput?.addEventListener("input", () => {
  renderLogs(allLogs, searchInput.value);
});

exportBtn?.addEventListener("click", () => {
  if (allLogs.length === 0) {
    alert("No logs to export.");
    return;
  }
  const csv = ["timestamp,user_id,patient_id,risk_severity,query"].concat(
    allLogs.map((l) => `"${l.timestamp}","${l.user_id}","${l.patient_id}","${l.risk_severity}","${(l.query || "").replace(/"/g, '""')}"`)
  ).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "phi-access-logs.csv";
  a.click();
});

clearLogsBtn?.addEventListener("click", async () => {
  if (!confirm("Clear all PHI access logs? This cannot be undone. Metrics and alerts will be reset.")) return;
  try {
    const res = await fetch(`${API_BASE}/logs`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.statusText);
    allLogs = [];
    renderLogs(allLogs);
    window.dispatchEvent(new Event("logUpdated"));
  } catch (e) {
    console.error("Clear logs error:", e);
    alert("Failed to clear logs. Is the backend running?");
  }
});

loadLogs();

window.addEventListener("logUpdated", () => {
  loadLogs();
});
