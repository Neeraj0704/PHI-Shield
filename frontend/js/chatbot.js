var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const session = JSON.parse(rawSession);
if (!session.loggedIn) {
    window.location.href = "../index.html";
    throw new Error("Invalid session — redirecting.");
}
// --- DOM ---
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const patientSelect = document.getElementById("patient-select");
const assistantSub = document.getElementById("assistant-sub");
const patientPlaceholder = document.getElementById("patient-placeholder");
const patientContent = document.getElementById("patient-content");
const patientName = document.getElementById("patient-name");
const patientMrn = document.getElementById("patient-mrn");
const patientBadges = document.getElementById("patient-badges");
const patientPhoto = document.getElementById("patient-photo");
const vitalBp = document.getElementById("vital-bp-value");
const vitalHr = document.getElementById("vital-hr-value");
const quickBtns = document.querySelectorAll(".quick-btn");
// --- State ---
let patients = [];
let selectedPatientId = "";
// --- Helpers ---
function addChatBubble(sender, text) {
    const div = document.createElement("div");
    div.className = `chat-bubble ${sender}`;
    if (sender === "loading") {
        div.setAttribute("data-loading", "true");
        div.innerHTML = `<span class="loading-dots"></span> ${text}`;
    }
    else {
        div.textContent = text;
    }
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
function removeLoadingBubble() {
    const loading = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
    if (loading)
        loading.remove();
}
function showLoadingSteps() {
    var _a;
    const messages = [
        "Retrieving patient data...",
        "Asking clinical assistant...",
        "Processing response...",
    ];
    let idx = 0;
    addChatBubble("loading", (_a = messages[0]) !== null && _a !== void 0 ? _a : "Loading...");
    const interval = setInterval(() => {
        idx = (idx + 1) % messages.length;
        const bubble = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
        if (bubble)
            bubble.innerHTML = `<span class="loading-dots"></span> ${messages[idx]}`;
    }, 2000);
    return {
        update(msg) {
            const bubble = chatWindow.querySelector('.chat-bubble.loading[data-loading="true"]');
            if (bubble)
                bubble.innerHTML = `<span class="loading-dots"></span> ${msg}`;
        },
        remove() {
            clearInterval(interval);
            removeLoadingBubble();
        },
    };
}
const FETCH_TIMEOUT_MS = 8000;
const CONNECTING_MSG_MS = 2000;
function fetchPatients() {
    return __awaiter(this, void 0, void 0, function* () {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const connectingId = setTimeout(() => {
            var _a;
            if (patientSelect.options.length === 1 && ((_a = patientSelect.options[0]) === null || _a === void 0 ? void 0 : _a.value) === "") {
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
            const res = yield fetch(`${API_BASE}/patients`, { signal: controller.signal });
            clearTimeout(timeoutId);
            clearTimeout(connectingId);
            if (!res.ok)
                throw new Error(`Failed to load patients (${res.status})`);
            const data = yield res.json();
            if (!Array.isArray(data))
                throw new Error("Invalid response from server");
            return data;
        }
        catch (e) {
            clearTimeout(timeoutId);
            clearTimeout(connectingId);
            throw e;
        }
    });
}
function fetchPatientDetail(patientId) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch(`${API_BASE}/patients/${patientId}`);
        if (!res.ok)
            return null;
        return res.json();
    });
}
function renderPatientSelect(list, filterQuery) {
    const q = (filterQuery !== null && filterQuery !== void 0 ? filterQuery : "").trim().toLowerCase();
    const filtered = q
        ? list.filter((p) => {
            var _a, _b;
            return p.display_name.toLowerCase().includes(q) ||
                ((_a = p.patient_id) !== null && _a !== void 0 ? _a : "").toLowerCase().includes(q) ||
                ((_b = p.mrn) !== null && _b !== void 0 ? _b : "").toLowerCase().includes(q);
        })
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
        if (p)
            assistantSub.textContent = `Discussing: ${p.display_name}`;
    }
    else if (first) {
        selectedPatientId = first.patient_id;
        patientSelect.value = selectedPatientId;
        assistantSub.textContent = `Discussing: ${first.display_name}`;
        updatePatientCard(first);
        loadPatientVitals(selectedPatientId);
    }
}
function setupPatientSearch() {
    const searchInput = document.getElementById("search-patients");
    searchInput === null || searchInput === void 0 ? void 0 : searchInput.addEventListener("input", () => {
        const q = searchInput.value.trim();
        renderPatientSelect(patients, q);
    });
}
function updatePatientCard(p) {
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
    if (patientPhoto)
        patientPhoto.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.patient_id}`;
}
function updateTabContentFromDetail(detail) {
    var _a, _b, _c, _d, _e, _f, _g;
    const overviewEl = document.getElementById("overview-content");
    const medsEl = document.getElementById("medications-content");
    const notesEl = document.getElementById("notes-content");
    const allergiesEl = document.getElementById("allergies-content");
    const testResultsEl = document.getElementById("test-results-content");
    if (!detail) {
        if (overviewEl)
            overviewEl.textContent = "Select a patient to see overview.";
        if (medsEl)
            medsEl.textContent = "Select a patient to see medications.";
        if (notesEl)
            notesEl.textContent = "Select a patient to see notes.";
        if (allergiesEl)
            allergiesEl.textContent = "Select a patient to see allergies.";
        if (testResultsEl)
            testResultsEl.textContent = "Select a patient to see test results.";
        return;
    }
    const demo = detail.demographics || {};
    if (overviewEl) {
        const dx = ((_b = (_a = detail.medical_history) === null || _a === void 0 ? void 0 : _a.diagnoses) === null || _b === void 0 ? void 0 : _b.join(", ")) || "—";
        overviewEl.innerHTML = `<strong>${(_c = demo.name) !== null && _c !== void 0 ? _c : detail.patient_id}</strong>, ${(_d = demo.age) !== null && _d !== void 0 ? _d : "—"} yrs · ${(_e = demo.gender) !== null && _e !== void 0 ? _e : "—"}<br>DOB: ${(_f = demo.dob) !== null && _f !== void 0 ? _f : "—"}<br><br>Diagnoses: ${dx}<br>${((_g = detail.medical_history) === null || _g === void 0 ? void 0 : _g.symptom_trend) ? `Trend: ${detail.medical_history.symptom_trend}` : ""}`;
    }
    if (medsEl) {
        const meds = detail.medications_active;
        if (meds === null || meds === void 0 ? void 0 : meds.length) {
            medsEl.innerHTML = meds.map((m) => { var _a, _b; return `${(_a = m.name) !== null && _a !== void 0 ? _a : "—"} ${m.dose_mg != null ? m.dose_mg + " mg" : ""} ${(_b = m.frequency) !== null && _b !== void 0 ? _b : ""}`; }).join("<br>");
        }
        else
            medsEl.textContent = "No active medications on file.";
    }
    if (notesEl) {
        const notes = detail.provider_notes;
        if (notes === null || notes === void 0 ? void 0 : notes.length) {
            notesEl.innerHTML = notes.map((n) => { var _a, _b; return `<strong>${(_a = n.date) !== null && _a !== void 0 ? _a : ""}</strong>: ${(_b = n.note_summary) !== null && _b !== void 0 ? _b : ""}`; }).join("<br><br>");
        }
        else
            notesEl.textContent = "No provider notes on file.";
    }
    if (allergiesEl)
        allergiesEl.textContent = "No allergies on file.";
    if (testResultsEl)
        testResultsEl.textContent = "Lab results available in patient record.";
}
function loadPatientVitals(patientId) {
    return __awaiter(this, void 0, void 0, function* () {
        vitalBp.textContent = "—";
        vitalHr.textContent = "—";
        const detail = yield fetchPatientDetail(patientId);
        updateTabContentFromDetail(detail !== null && detail !== void 0 ? detail : null);
        if (!(detail === null || detail === void 0 ? void 0 : detail.vitals))
            return;
        const v = detail.vitals;
        const bp = v.blood_pressure;
        if (bp && bp.systolic != null && bp.diastolic != null) {
            vitalBp.textContent = `${bp.systolic}/${bp.diastolic} mmHg`;
        }
        if (v.heart_rate != null)
            vitalHr.textContent = `${v.heart_rate} bpm`;
        initCharts(detail);
    });
}
let bpChart = null;
let hrChart = null;
function initCharts(detail) {
    var _a;
    const Chart = window.Chart;
    if (!Chart || !(detail === null || detail === void 0 ? void 0 : detail.vitals))
        return;
    const v = detail.vitals;
    const bp = v.blood_pressure;
    const hr = (_a = v.heart_rate) !== null && _a !== void 0 ? _a : 0;
    const bpCanvas = document.getElementById("bloodPressureChart");
    if (bpCanvas && (bp === null || bp === void 0 ? void 0 : bp.systolic) != null && (bp === null || bp === void 0 ? void 0 : bp.diastolic) != null) {
        const ctx = bpCanvas.getContext("2d");
        if (ctx) {
            if (bpChart)
                bpChart.destroy();
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
    const hrCanvas = document.getElementById("heartRateChart");
    if (hrCanvas && hr != null) {
        const ctx = hrCanvas.getContext("2d");
        if (ctx) {
            if (hrChart)
                hrChart.destroy();
            hrChart = new Chart(ctx, {
                type: "line",
                data: { labels: ["Current"], datasets: [{ label: "Heart Rate (bpm)", data: [hr], borderColor: "rgb(255, 159, 64)", tension: 0.4, fill: false }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, scales: { y: { min: 40, max: 120 } } },
            });
        }
    }
}
function sendMessage(text) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!selectedPatientId) {
            addChatBubble("bot", "Please select a patient first.");
            return;
        }
        const loading = showLoadingSteps();
        try {
            const res = yield fetch(`${API_BASE}/ask`, {
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
                const err = yield res.text();
                addChatBubble("bot", `Error: ${err || res.status}`);
                return;
            }
            const data = yield res.json();
            addChatBubble("bot", data.answer || "No response.");
            if (data.logEntry) {
                const logEntry = data.logEntry;
                const existing = JSON.parse(localStorage.getItem("phiAccessLogs") || "[]");
                existing.unshift(Object.assign(Object.assign({}, logEntry), { details: text }));
                localStorage.setItem("phiAccessLogs", JSON.stringify(existing));
                localStorage.setItem("phiLogsUpdated", Date.now().toString());
                window.dispatchEvent(new CustomEvent("logUpdated", { detail: logEntry }));
            }
        }
        catch (e) {
            loading.remove();
            addChatBubble("bot", `Connection error: ${e.message}. Is the backend running at ${API_BASE}?`);
        }
    });
}
// --- Tab switching ---
function switchTab(tabName) {
    const tabs = document.querySelectorAll(".tabs a[data-tab]");
    const panels = document.querySelectorAll(".tab-panel");
    tabs.forEach((t) => {
        t.classList.remove("active");
        if (t.getAttribute("data-tab") === tabName)
            t.classList.add("active");
    });
    panels.forEach((p) => {
        const panel = p;
        panel.hidden = (panel.getAttribute("data-panel") !== tabName);
    });
}
// --- Profile dropdown ---
function setupProfileDropdown() {
    const profileBtn = document.getElementById("profile-btn");
    const dropdown = document.getElementById("profile-dropdown");
    const logoutBtn = document.getElementById("logout-btn");
    const profileLink = document.getElementById("profile-link");
    profileBtn === null || profileBtn === void 0 ? void 0 : profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown) {
            dropdown.hidden = !dropdown.hidden;
            profileBtn === null || profileBtn === void 0 ? void 0 : profileBtn.setAttribute("aria-expanded", dropdown.hidden ? "false" : "true");
        }
    });
    document.addEventListener("click", () => {
        if (dropdown)
            dropdown.hidden = true;
        profileBtn === null || profileBtn === void 0 ? void 0 : profileBtn.setAttribute("aria-expanded", "false");
    });
    logoutBtn === null || logoutBtn === void 0 ? void 0 : logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("mockSession");
        window.location.href = "../index.html";
    });
    profileLink === null || profileLink === void 0 ? void 0 : profileLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (dropdown)
            dropdown.hidden = true;
    });
}
// --- Nav icons (bell, settings) ---
function setupNavIcons() {
    const bell = document.getElementById("nav-bell");
    const settings = document.getElementById("nav-settings");
    bell === null || bell === void 0 ? void 0 : bell.addEventListener("click", () => { window.location.href = "compliance.html"; });
    settings === null || settings === void 0 ? void 0 : settings.addEventListener("click", () => { window.location.href = "compliance.html"; });
}
// --- Init ---
addChatBubble("bot", "Hello! I'm your clinical assistant. Select a patient and ask a question.");
function showBackendError(message) {
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
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        patients = yield fetchPatients();
        const errEl = document.getElementById("backend-error");
        const hintEl = document.getElementById("patient-load-hint");
        if (errEl)
            errEl.hidden = true;
        if (hintEl)
            hintEl.hidden = true;
        renderPatientSelect(patients);
    }
    catch (e) {
        const msg = e.message;
        showBackendError(msg);
    }
}))();
// Tab clicks
document.querySelectorAll(".tabs a[data-tab]").forEach((tab) => {
    tab.addEventListener("click", (e) => {
        e.preventDefault();
        const name = tab.getAttribute("data-tab");
        if (name)
            switchTab(name);
    });
});
setupProfileDropdown();
setupNavIcons();
setupPatientSearch();
patientSelect === null || patientSelect === void 0 ? void 0 : patientSelect.addEventListener("change", () => {
    selectedPatientId = patientSelect.value;
    const p = patients.find((x) => x.patient_id === selectedPatientId);
    if (p) {
        assistantSub.textContent = `Discussing: ${p.display_name}`;
        updatePatientCard(p);
        loadPatientVitals(selectedPatientId);
    }
});
chatForm === null || chatForm === void 0 ? void 0 : chatForm.addEventListener("submit", (e) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    e.preventDefault();
    const text = (_a = chatInput === null || chatInput === void 0 ? void 0 : chatInput.value) === null || _a === void 0 ? void 0 : _a.trim();
    if (!text)
        return;
    addChatBubble("user", text);
    chatInput.value = "";
    yield sendMessage(text);
}));
quickBtns.forEach((btn) => {
    btn.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const text = ((_a = btn.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || "";
        if (!text)
            return;
        addChatBubble("user", text);
        yield sendMessage(text);
    }));
});
//# sourceMappingURL=chatbot.js.map