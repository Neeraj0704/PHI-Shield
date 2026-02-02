/**
 * Compliance Dashboard — metrics and alerts from backend API only.
 */
import { API_BASE } from "./config.js";

const session = localStorage.getItem("mockSession");
if (!session) {
  window.location.href = "../index.html";
}

const logoutLink = document.getElementById("logout-link") as HTMLAnchorElement;
const reportBtn = document.querySelector(".generate-btn") as HTMLButtonElement;
const metricAlerts = document.getElementById("metric-alerts");
const metricInvestigations = document.getElementById("metric-investigations");
const metricPhiViews = document.getElementById("metric-phi-views");
const alertsTbody = document.getElementById("alerts-tbody");

logoutLink?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("mockSession");
  window.location.href = "../index.html";
});

try {
  const s = JSON.parse(session || "{}");
  const nameEl = document.getElementById("sidebar-username");
  if (nameEl && s.username) nameEl.textContent = s.username.split("@")[0] || "Compliance";
} catch (_) {}

reportBtn?.addEventListener("click", () => {
  alert("Report export can be added to use GET /logs and export as CSV.");
});

interface Metrics {
  total_today?: number;
  total_24h?: number;
  active_investigations?: number;
  phi_views_24h?: number;
  by_day?: { date: string; count: number }[];
  by_user?: { user_id: string; count: number }[];
  risk_distribution?: Record<string, number>;
}

interface AlertRow {
  id: string;
  severity: string;
  description: string;
  user_id: string;
  timestamp: string;
  log_id?: string;
  type?: string;
}

async function loadMetrics(): Promise<Metrics> {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) return {};
  return res.json();
}

async function loadAlerts(): Promise<AlertRow[]> {
  const res = await fetch(`${API_BASE}/alerts`);
  if (!res.ok) return [];
  return res.json();
}

function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

function renderMetrics(m: Metrics): void {
  if (metricAlerts) metricAlerts.textContent = String(m.total_today ?? 0);
  if (metricInvestigations) metricInvestigations.textContent = String(m.active_investigations ?? 0);
  if (metricPhiViews) metricPhiViews.textContent = String(m.phi_views_24h ?? m.total_24h ?? 0);
}

function renderAlerts(alerts: AlertRow[]): void {
  if (!alertsTbody) return;
  alertsTbody.innerHTML = "";
  if (alerts.length === 0) {
    alertsTbody.innerHTML = '<div class="row empty-row"><div colspan="5">No alerts</div></div>';
    return;
  }
  alerts.forEach((a) => {
    const row = document.createElement("div");
    row.className = "row";
    const severityClass = a.severity === "high" || a.severity === "critical" ? "high" : a.severity === "medium" ? "med" : "low";
    const severityLabel = a.severity.charAt(0).toUpperCase() + a.severity.slice(1);
    const detailsHref = a.log_id ? `log-details.html?id=${a.log_id}` : "#";
    row.innerHTML = `
      <div><span class="tag ${severityClass}">${severityLabel}</span></div>
      <div>${a.description || "—"}</div>
      <div>${a.user_id || "—"}</div>
      <div>${formatTimestamp(a.timestamp)}</div>
      <a class="details" href="${detailsHref}">View Details</a>
    `;
    alertsTbody.appendChild(row);
  });
}

let chartOverTime: any = null;
let chartByUser: any = null;

function renderCharts(m: Metrics): void {
  const Chart = (window as any).Chart;
  if (!Chart) return;

  const byDay = m.by_day || [];
  const byUser = m.by_user || [];

  const overTimeCanvas = document.getElementById("phiAccessOverTimeChart") as HTMLCanvasElement;
  if (overTimeCanvas) {
    const ctx = overTimeCanvas.getContext("2d");
    if (ctx) {
      if (chartOverTime) chartOverTime.destroy();
      chartOverTime = new Chart(ctx, {
        type: "bar",
        data: {
          labels: byDay.map((d) => d.date),
          datasets: [{ label: "PHI Accesses", data: byDay.map((d) => d.count), backgroundColor: "rgba(37, 99, 235, 0.6)", borderColor: "rgba(37, 99, 235, 1)", borderWidth: 1 }],
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
  }

  const byUserCanvas = document.getElementById("phiAccessByUserChart") as HTMLCanvasElement;
  if (byUserCanvas) {
    const ctx = byUserCanvas.getContext("2d");
    if (ctx) {
      if (chartByUser) chartByUser.destroy();
      const colors = ["rgba(37, 99, 235, 0.6)", "rgba(16, 185, 129, 0.6)", "rgba(245, 158, 11, 0.6)", "rgba(239, 68, 68, 0.6)", "rgba(139, 92, 246, 0.6)"];
      chartByUser = new Chart(ctx, {
        type: "bar",
        data: {
          labels: byUser.map((u) => u.user_id),
          datasets: [{ label: "Accesses", data: byUser.map((u) => u.count), backgroundColor: colors, borderWidth: 1 }],
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
      });
    }
  }
}

async function init(): Promise<void> {
  try {
    const [metrics, alerts] = await Promise.all([loadMetrics(), loadAlerts()]);
    renderMetrics(metrics);
    renderAlerts(alerts);
    renderCharts(metrics);
  } catch (e) {
    console.error("Compliance load error:", e);
    if (metricAlerts) metricAlerts.textContent = "—";
    if (metricInvestigations) metricInvestigations.textContent = "—";
    if (metricPhiViews) metricPhiViews.textContent = "—";
    if (alertsTbody) alertsTbody.innerHTML = '<div class="row empty-row"><div>Failed to load. Is the backend running?</div></div>';
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
