/**
 * Chatbot — Clinical assistant connected to backend API.
 * Loading messages, patient selector, real data only.
 */
import { API_BASE } from "./config.js";

// --- Session ---
const rawSession = localStorage.getItem("mockSession");
if (!rawSession) {
  window.location.href = "../index.html";
  throw new Error("User not logged in — redirecting.");
}
const session = JSON.parse(rawSession) as { username: string; loggedIn: boolean; timestamp: number };
if (!session.loggedIn) {
  window.location.href = "../index.html";
  throw new Error("Invalid session — redirecting.");
}

// --- DOM ---
const chatWindow = document.getElementById("chat-window") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const patientSelect = document.getElementById("patient-select") as HTMLSelectElement;
const assistantSub = document.getElementById("assistant-sub") as HTMLParagraphElement;
const patientPlaceholder = document.getElementById("patient-placeholder") as HTMLDivElement;
const patientContent = document.getElementById("patient-content") as HTMLDivElement;
const patientName = document.getElementById("patient-name") as HTMLElement;
const patientMrn = document.getElementById("patient-mrn") as HTMLElement;
const patientBadges = document.getElementById("patient-badges") as HTMLDivElement;
const patientPhoto = document.getElementById("patient-photo") as HTMLImageElement;
const vitalBp = document.getElementById("vital-bp-value") as HTMLElement;
const vitalHr = document.getElementById("vital-hr-value") as HTMLElement;
const quickBtns = document.querySelectorAll(".quick-btn");

// --- Types ---
interface PatientSummary {
  patient_id: string;
  display_name: string;
  age?: number;
  mrn?: string;
}
interface PatientDetail {
  patient_id: string;
  demographics?: { name?: string; age?: number; gender?: string; dob?: string };
  vitals?: {
    blood_pressure?: { systolic?: number; diastolic?: number };
    heart_rate?: number;
  };
  medical_history?: { diagnoses?: string[]; symptom_trend?: string };
  medications_active?: Array<{ name?: string; dose_mg?: number; frequency?: string }>;
  provider_notes?: Array<{ date?: string; note_summary?: string }>;
}
interface LogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  patient_id: string;
  query: string;
  llm_response: string;
  risk_severity: string;
  phi_classifications?: unknown[];
}

// --- State ---
let patients: PatientSummary[] = [];
let selectedPatientId: string = "";

// --- Helpers ---
function addChatBubble(sender: "user" | "bot" | "loading", text: string): void {
  const div = document.createElement("div");
  div.className = `chat-bubble ${sender}`;
  if (sender === "loading") {
    div.setAttribute("data-loading", "true");
    div.innerHTML = `<span class="loading-dots"></span> ${text}`;
  } else {
    div.textContent = text;
  }
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeLoadingBubble(): void {
  const loading = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
  if (loading) loading.remove();
}

function showLoadingSteps(): { update: (msg: string) => void; remove: () => void } {
  const messages = [
    "Retrieving patient data...",
    "Asking clinical assistant...",
    "Processing response...",
  ];
  let idx = 0;
  addChatBubble("loading", messages[0] ?? "Loading...");
  const interval = setInterval(() => {
    idx = (idx + 1) % messages.length;
    const bubble = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
    if (bubble) bubble.innerHTML = `<span class="loading-dots"></span> ${messages[idx]}`;
  }, 2000);
  return {
    update(msg: string) {
      const bubble = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
      if (bubble) bubble.innerHTML = `<span class="loading-dots"></span> ${msg}`;
    },
    remove() {
      clearInterval(interval);
      removeLoadingBubble();
    },
  };
}

const FETCH_TIMEOUT_MS = 8000;
const CONNECTING_MSG_MS = 2000;

async function fetchPatients(): Promise<PatientSummary[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const connectingId = setTimeout(() => {
    if (patientSelect.options.length === 1 && patientSelect.options[0]?.value === "") {
      patientSelect.options[0].textContent = "Connecting to backend...";
      const hint = document.getElementById("patient-load-hint");
      if (hint) {
        hint.hidden = false;
        hint.textContent = `Checking ${API_BASE} ...`;
        hint.classList.remove("error");
      }
    }
  }, CONNECTING_MSG_MS);
  try {
    const res = await fetch(`${API_BASE}/patients`, { signal: controller.signal });
    clearTimeout(timeoutId);
    clearTimeout(connectingId);
    if (!res.ok) throw new Error(`Failed to load patients (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid response from server");
    return data as PatientSummary[];
  } catch (e) {
    clearTimeout(timeoutId);
    clearTimeout(connectingId);
    throw e;
  }
}

async function fetchPatientDetail(patientId: string): Promise<PatientDetail | null> {
  const res = await fetch(`${API_BASE}/patients/${patientId}`);
  if (!res.ok) return null;
  return res.json();
}

function renderPatientSelect(list: PatientSummary[], filterQuery?: string): void {
  const q = (filterQuery ?? "").trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          (p.patient_id ?? "").toLowerCase().includes(q) ||
          (p.mrn ?? "").toLowerCase().includes(q)
      )
    : list;

  patientSelect.innerHTML = "";
  if (filtered.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = q ? "No matching patients" : "No patients";
    patientSelect.appendChild(opt);
    patientPlaceholder.style.display = "block";
    patientContent.style.display = "none";
    assistantSub.textContent = "Select a patient to start";
    return;
  }
  filtered.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.patient_id;
    opt.textContent = `${p.display_name} (${p.patient_id})`;
    patientSelect.appendChild(opt);
  });
  const first = filtered[0];
  const keepSelection = selectedPatientId && filtered.some((p) => p.patient_id === selectedPatientId);
  if (keepSelection) {
    patientSelect.value = selectedPatientId;
    const p = patients.find((x) => x.patient_id === selectedPatientId);
    if (p) assistantSub.textContent = `Discussing: ${p.display_name}`;
  } else if (first) {
    selectedPatientId = first.patient_id;
    patientSelect.value = selectedPatientId;
    assistantSub.textContent = `Discussing: ${first.display_name}`;
    updatePatientCard(first);
    loadPatientVitals(selectedPatientId);
  }
}

function setupPatientSearch(): void {
  const searchInput = document.getElementById("search-patients") as HTMLInputElement;
  searchInput?.addEventListener("input", () => {
    const q = searchInput.value.trim();
    renderPatientSelect(patients, q);
  });
}

function updatePatientCard(p: PatientSummary): void {
  if (!p) {
    patientPlaceholder.style.display = "block";
    patientContent.style.display = "none";
    return;
  }
  patientPlaceholder.style.display = "none";
  patientContent.style.display = "flex";
  patientName.textContent = `${p.display_name}${p.age != null ? `, ${p.age}` : ""}`;
  patientMrn.textContent = `MRN: ${p.mrn || p.patient_id}`;
  patientBadges.innerHTML = "";
  if (patientPhoto) patientPhoto.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.patient_id}`;
}

function updateTabContentFromDetail(detail: PatientDetail | null): void {
  const overviewEl = document.getElementById("overview-content");
  const medsEl = document.getElementById("medications-content");
  const notesEl = document.getElementById("notes-content");
  const allergiesEl = document.getElementById("allergies-content");
  const testResultsEl = document.getElementById("test-results-content");

  if (!detail) {
    if (overviewEl) overviewEl.textContent = "Select a patient to see overview.";
    if (medsEl) medsEl.textContent = "Select a patient to see medications.";
    if (notesEl) notesEl.textContent = "Select a patient to see notes.";
    if (allergiesEl) allergiesEl.textContent = "Select a patient to see allergies.";
    if (testResultsEl) testResultsEl.textContent = "Select a patient to see test results.";
    return;
  }
  const demo = detail.demographics || {};
  if (overviewEl) {
    const dx = detail.medical_history?.diagnoses?.join(", ") || "—";
    overviewEl.innerHTML = `<strong>${demo.name ?? detail.patient_id}</strong>, ${demo.age ?? "—"} yrs · ${demo.gender ?? "—"}<br>DOB: ${demo.dob ?? "—"}<br><br>Diagnoses: ${dx}<br>${detail.medical_history?.symptom_trend ? `Trend: ${detail.medical_history.symptom_trend}` : ""}`;
  }
  if (medsEl) {
    const meds = detail.medications_active;
    if (meds?.length) {
      medsEl.innerHTML = meds.map((m) => `${m.name ?? "—"} ${m.dose_mg != null ? m.dose_mg + " mg" : ""} ${m.frequency ?? ""}`).join("<br>");
    } else medsEl.textContent = "No active medications on file.";
  }
  if (notesEl) {
    const notes = detail.provider_notes;
    if (notes?.length) {
      notesEl.innerHTML = notes.map((n) => `<strong>${n.date ?? ""}</strong>: ${n.note_summary ?? ""}`).join("<br><br>");
    } else notesEl.textContent = "No provider notes on file.";
  }
  if (allergiesEl) allergiesEl.textContent = "No allergies on file.";
  if (testResultsEl) testResultsEl.textContent = "Lab results available in patient record.";
}

async function loadPatientVitals(patientId: string): Promise<void> {
  vitalBp.textContent = "—";
  vitalHr.textContent = "—";
  const detail = await fetchPatientDetail(patientId);
  updateTabContentFromDetail(detail ?? null);
  if (!detail?.vitals) return;
  const v = detail.vitals;
  const bp = v.blood_pressure;
  if (bp && bp.systolic != null && bp.diastolic != null) {
    vitalBp.textContent = `${bp.systolic}/${bp.diastolic} mmHg`;
  }
  if (v.heart_rate != null) vitalHr.textContent = `${v.heart_rate} bpm`;
  initCharts(detail);
}

let bpChart: unknown = null;
let hrChart: unknown = null;
function initCharts(detail: PatientDetail): void {
  const Chart = (window as any).Chart;
  if (!Chart || !detail?.vitals) return;
  const v = detail.vitals;
  const bp = v.blood_pressure;
  const hr = v.heart_rate ?? 0;

  const bpCanvas = document.getElementById("bloodPressureChart") as HTMLCanvasElement;
  if (bpCanvas && bp?.systolic != null && bp?.diastolic != null) {
    const ctx = bpCanvas.getContext("2d");
    if (ctx) {
      if (bpChart) (bpChart as any).destroy();
      bpChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: ["Current"],
          datasets: [
            { label: "Systolic", data: [bp.systolic], borderColor: "rgb(255, 159, 64)", tension: 0.4, fill: false },
            { label: "Diastolic", data: [bp.diastolic], borderColor: "rgb(54, 162, 235)", tension: 0.4, fill: false },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, scales: { y: { min: 50, max: 200 } } },
      });
    }
  }
  const hrCanvas = document.getElementById("heartRateChart") as HTMLCanvasElement;
  if (hrCanvas && hr != null) {
    const ctx = hrCanvas.getContext("2d");
    if (ctx) {
      if (hrChart) (hrChart as any).destroy();
      hrChart = new Chart(ctx, {
        type: "line",
        data: { labels: ["Current"], datasets: [{ label: "Heart Rate (bpm)", data: [hr], borderColor: "rgb(255, 159, 64)", tension: 0.4, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, scales: { y: { min: 40, max: 120 } } },
      });
    }
  }
}

async function sendMessage(text: string): Promise<void> {
  if (!selectedPatientId) {
    addChatBubble("bot", "Please select a patient first.");
    return;
  }
  const loading = showLoadingSteps();
  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: session.username,
        patient_id: selectedPatientId,
        question: text,
      }),
    });
    loading.remove();
    if (!res.ok) {
      const err = await res.text();
      addChatBubble("bot", `Error: ${err || res.status}`);
      return;
    }
    const data = await res.json();
    addChatBubble("bot", data.answer || "No response.");
    if (data.logEntry) {
      const logEntry = data.logEntry as LogEntry;
      const existing = JSON.parse(localStorage.getItem("phiAccessLogs") || "[]");
      existing.unshift({ ...logEntry, details: text });
      localStorage.setItem("phiAccessLogs", JSON.stringify(existing));
      localStorage.setItem("phiLogsUpdated", Date.now().toString());
      window.dispatchEvent(new CustomEvent("logUpdated", { detail: logEntry }));
    }
  } catch (e) {
    loading.remove();
    addChatBubble("bot", `Connection error: ${(e as Error).message}. Is the backend running at ${API_BASE}?`);
  }
}

// --- Tab switching ---
function switchTab(tabName: string): void {
  const tabs = document.querySelectorAll(".tabs a[data-tab]");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((t) => {
    t.classList.remove("active");
    if ((t as HTMLElement).getAttribute("data-tab") === tabName) t.classList.add("active");
  });
  panels.forEach((p) => {
    const panel = p as HTMLElement;
    panel.hidden = (panel.getAttribute("data-panel") !== tabName);
  });
}

// --- Profile dropdown ---
function setupProfileDropdown(): void {
  const profileBtn = document.getElementById("profile-btn");
  const dropdown = document.getElementById("profile-dropdown");
  const logoutBtn = document.getElementById("logout-btn");
  const profileLink = document.getElementById("profile-link");

  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown) {
      dropdown.hidden = !dropdown.hidden;
      profileBtn?.setAttribute("aria-expanded", dropdown.hidden ? "false" : "true");
    }
  });

  document.addEventListener("click", () => {
    if (dropdown) dropdown.hidden = true;
    profileBtn?.setAttribute("aria-expanded", "false");
  });

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("mockSession");
    window.location.href = "../index.html";
  });

  profileLink?.addEventListener("click", (e) => {
    e.preventDefault();
    if (dropdown) dropdown.hidden = true;
  });
}

// --- Nav icons (bell, settings) ---
function setupNavIcons(): void {
  const bell = document.getElementById("nav-bell");
  const settings = document.getElementById("nav-settings");
  bell?.addEventListener("click", () => { window.location.href = "compliance.html"; });
  settings?.addEventListener("click", () => { window.location.href = "compliance.html"; });
}

// --- Init ---
addChatBubble("bot", "Hello! I'm your clinical assistant. Select a patient and ask a question.");

function showBackendError(message: string): void {
  patientSelect.innerHTML = '<option value="">Failed to load patients</option>';
  const errEl = document.getElementById("backend-error");
  const hintEl = document.getElementById("patient-load-hint");
  if (errEl) {
    errEl.hidden = false;
    errEl.textContent = message;
  }
  if (hintEl) {
    hintEl.hidden = false;
    hintEl.classList.add("error");
    hintEl.textContent = "Start the backend: cd backend && source .venv/bin/activate && python -m uvicorn app.server:app --port 8000";
  }
  addChatBubble("bot", `Could not load patients: ${message}. Is the backend running at ${API_BASE}?`);
}

(async () => {
  try {
    patients = await fetchPatients();
    const errEl = document.getElementById("backend-error");
    const hintEl = document.getElementById("patient-load-hint");
    if (errEl) errEl.hidden = true;
    if (hintEl) hintEl.hidden = true;
    renderPatientSelect(patients);
  } catch (e) {
    const msg = (e as Error).message;
    showBackendError(msg);
  }
})();

// Tab clicks
document.querySelectorAll(".tabs a[data-tab]").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    const name = (tab as HTMLElement).getAttribute("data-tab");
    if (name) switchTab(name);
  });
});

setupProfileDropdown();
setupNavIcons();
setupPatientSearch();

patientSelect?.addEventListener("change", () => {
  selectedPatientId = patientSelect.value;
  const p = patients.find((x) => x.patient_id === selectedPatientId);
  if (p) {
    assistantSub.textContent = `Discussing: ${p.display_name}`;
    updatePatientCard(p);
    loadPatientVitals(selectedPatientId);
  }
});

chatForm?.addEventListener("submit", async (e: Event) => {
  e.preventDefault();
  const text = chatInput?.value?.trim();
  if (!text) return;
  addChatBubble("user", text);
  chatInput.value = "";
  await sendMessage(text);
});

quickBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = (btn as HTMLButtonElement).textContent?.trim() || "";
    if (!text) return;
    addChatBubble("user", text);
    await sendMessage(text);
  });
});
