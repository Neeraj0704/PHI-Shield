/**
 * Log Details — single log from GET /logs/:id only.
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

const logoutLink = document.getElementById("logout-link") as HTMLAnchorElement;
const backBtn = document.getElementById("back-btn");
const logNotFound = document.getElementById("log-not-found");
const logDetailsSection = document.getElementById("log-details-section");
const detailTimestamp = document.getElementById("detail-timestamp");
const detailUser = document.getElementById("detail-user");
const detailPatientId = document.getElementById("detail-patient-id");
const detailRisk = document.getElementById("detail-risk");
const detailPhiTags = document.getElementById("detail-phi-tags");
const detailQuery = document.getElementById("detail-query");
const detailResponse = document.getElementById("detail-response");
const exportBtn = document.querySelector(".export-btn") as HTMLButtonElement;

logoutLink?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("mockSession");
  window.location.href = "../index.html";
});

backBtn?.addEventListener("click", () => window.history.back());

const riskClassMap: Record<string, string> = {
  high: "high",
  medium: "med",
  moderate: "moderate",
  low: "low",
  safe: "safe",
  severe: "severe",
  critical: "severe",
};

interface LogDetail {
  id: string;
  timestamp: string;
  user_id: string;
  patient_id: string;
  query: string;
  llm_response: string;
  risk_severity: string;
  phi_classifications?: { type: string; count?: number }[];
}

function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US");
  } catch {
    return ts;
  }
}

function renderLog(log: LogDetail): void {
  if (logNotFound) logNotFound.style.display = "none";
  if (logDetailsSection) logDetailsSection.style.display = "block";
  if (detailTimestamp) detailTimestamp.textContent = formatTimestamp(log.timestamp);
  if (detailUser) detailUser.textContent = log.user_id || "—";
  if (detailPatientId) detailPatientId.textContent = log.patient_id || "—";
  const risk = log.risk_severity?.toLowerCase() || "";
  const riskLabel = risk.charAt(0).toUpperCase() + risk.slice(1);
  const riskClass = riskClassMap[risk] || "low";
  if (detailRisk) detailRisk.innerHTML = `<span class="risk-badge ${riskClass}"><span class="risk-icon">⚠️</span> ${riskLabel}</span>`;
  const tags = log.phi_classifications || [];
  if (detailPhiTags) {
    if (tags.length === 0) detailPhiTags.textContent = "—";
    else detailPhiTags.innerHTML = tags.map((t) => `<span class="phi-tag">${t.type}</span>`).join(" ");
  }
  if (detailQuery) detailQuery.textContent = log.query || "—";
  if (detailResponse) detailResponse.textContent = log.llm_response || "—";
}

let currentLog: LogDetail | null = null;

async function loadLog(id: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/logs/${id}`);
    if (res.status === 404) {
      if (logNotFound) logNotFound.style.display = "block";
      if (logDetailsSection) logDetailsSection.style.display = "none";
      return;
    }
    if (!res.ok) throw new Error(res.statusText);
    currentLog = await res.json();
    if (currentLog) renderLog(currentLog);
  } catch (e) {
    console.error("Load log error:", e);
    if (logNotFound) {
      logNotFound.textContent = "Failed to load log. Is the backend running?";
      logNotFound.style.display = "block";
    }
    if (logDetailsSection) logDetailsSection.style.display = "none";
  }
}

exportBtn?.addEventListener("click", () => {
  if (!currentLog) return;
  const csv = `timestamp,user_id,patient_id,risk_severity,query,llm_response\n"${currentLog.timestamp}","${currentLog.user_id}","${currentLog.patient_id}","${currentLog.risk_severity}","${(currentLog.query || "").replace(/"/g, '""')}","${(currentLog.llm_response || "").replace(/"/g, '""')}"`;
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `log-${currentLog.id}.csv`;
  a.click();
});

const urlParams = new URLSearchParams(window.location.search);
const logId = urlParams.get("id");
if (logId) {
  loadLog(logId);
} else {
  if (logNotFound) {
    logNotFound.textContent = "No log ID provided.";
    logNotFound.style.display = "block";
  }
  if (logDetailsSection) logDetailsSection.style.display = "none";
}
