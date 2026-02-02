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
 * Access Policy Management — load/save policies via backend API.
 */
import { API_BASE } from "./config.js";
// Check if user is logged in
const session = localStorage.getItem("mockSession");
if (!session) {
    window.location.href = "../index.html";
}
/** All permissions available for roles (checkboxes in edit modal). */
const ALL_AVAILABLE_PERMISSIONS = [
    "View Patient Records",
    "Edit Patient Records",
    "Prescribe Medication",
    "Update Vitals",
    "View Patient Demographics",
    "Schedule Appointments",
    "View Anonymized Data",
    "View Billing Information",
    "Process Payments",
];
const policyRows = document.getElementById("policy-rows");
const addPolicyBtn = document.querySelector(".add-policy-btn");
const logoutLink = document.querySelector('a[href="../index.html"]');
const editModal = document.getElementById("edit-permissions-modal");
const modalRoleLabel = document.getElementById("modal-role-label");
const modalPermissionsList = document.getElementById("modal-permissions-list");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");
const modalOverlay = document.getElementById("modal-overlay");
const addModal = document.getElementById("add-policy-modal");
const addModalRoleInput = document.getElementById("add-modal-role");
const addModalPermissionsList = document.getElementById("add-modal-permissions-list");
const addModalCancel = document.getElementById("add-modal-cancel");
const addModalSave = document.getElementById("add-modal-save");
const addModalOverlay = document.getElementById("add-modal-overlay");
let editingRole = null;
function renderPolicies(policies) {
    if (!policyRows)
        return;
    policyRows.innerHTML = "";
    for (const p of policies) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
      <div class="role-name">${escapeHtml(p.role)}</div>
      <div class="permissions">
        ${(p.permissions || []).map((perm) => `<span class="permission-tag">${escapeHtml(perm)}</span>`).join("")}
      </div>
      <div class="last-updated">${escapeHtml(p.last_updated || "")}</div>
      <div class="actions">
        <button type="button" class="action-btn edit" data-role="${escapeAttr(p.role)}">Edit</button>
        <button type="button" class="action-btn delete" data-role="${escapeAttr(p.role)}">Delete</button>
      </div>
    `;
        policyRows.appendChild(row);
    }
    // Re-attach listeners
    policyRows.querySelectorAll(".action-btn.edit").forEach((btn) => {
        btn.addEventListener("click", () => { var _a; return handleEdit((_a = btn.dataset.role) !== null && _a !== void 0 ? _a : ""); });
    });
    policyRows.querySelectorAll(".action-btn.delete").forEach((btn) => {
        btn.addEventListener("click", () => { var _a; return handleDelete((_a = btn.dataset.role) !== null && _a !== void 0 ? _a : ""); });
    });
}
function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}
function escapeAttr(s) {
    return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fetchPolicies() {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch(`${API_BASE}/policies`);
        if (!res.ok)
            throw new Error(`Failed to load policies: ${res.status}`);
        return res.json();
    });
}
function loadPolicies() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const policies = yield fetchPolicies();
            renderPolicies(policies);
        }
        catch (e) {
            policyRows.innerHTML = `<div class="row"><div colspan="4" style="padding: 16px; color: #b91c1c;">Failed to load policies. Is the backend running at ${API_BASE}?</div></div>`;
        }
    });
}
function openAddModal() {
    if (addModalRoleInput)
        addModalRoleInput.value = "";
    if (!addModalPermissionsList)
        return;
    addModalPermissionsList.innerHTML = "";
    for (const perm of ALL_AVAILABLE_PERMISSIONS) {
        const id = `add-perm-${perm.replace(/\s+/g, "-").toLowerCase()}`;
        const item = document.createElement("label");
        item.className = "modal-permission-item";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.value = perm;
        input.checked = false;
        const span = document.createElement("span");
        span.textContent = perm;
        item.appendChild(input);
        item.appendChild(span);
        addModalPermissionsList.appendChild(item);
    }
    if (addModal) {
        addModal.hidden = false;
        addModalRoleInput === null || addModalRoleInput === void 0 ? void 0 : addModalRoleInput.focus();
    }
}
function closeAddModal() {
    if (addModal)
        addModal.hidden = true;
}
function getSelectedPermissionsFromAddModal() {
    if (!addModalPermissionsList)
        return [];
    const checkboxes = addModalPermissionsList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map((cb) => cb.value).filter(Boolean);
}
function saveAddModal() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const role = (_b = (_a = addModalRoleInput === null || addModalRoleInput === void 0 ? void 0 : addModalRoleInput.value) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
        if (!role) {
            alert("Please enter a role name.");
            addModalRoleInput === null || addModalRoleInput === void 0 ? void 0 : addModalRoleInput.focus();
            return;
        }
        const permissions = getSelectedPermissionsFromAddModal();
        try {
            const res = yield fetch(`${API_BASE}/policies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, permissions }),
            });
            if (!res.ok) {
                const err = yield res.text();
                alert(`Error: ${err || res.status}`);
                return;
            }
            closeAddModal();
            yield loadPolicies();
        }
        catch (e) {
            alert(`Error: ${e.message}`);
        }
    });
}
addModalCancel === null || addModalCancel === void 0 ? void 0 : addModalCancel.addEventListener("click", closeAddModal);
addModalOverlay === null || addModalOverlay === void 0 ? void 0 : addModalOverlay.addEventListener("click", closeAddModal);
addModalSave === null || addModalSave === void 0 ? void 0 : addModalSave.addEventListener("click", () => void saveAddModal());
addModal === null || addModal === void 0 ? void 0 : addModal.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
        closeAddModal();
});
function openEditModal(role, currentPermissions) {
    editingRole = role;
    if (modalRoleLabel)
        modalRoleLabel.textContent = `Role: ${role}`;
    if (!modalPermissionsList)
        return;
    modalPermissionsList.innerHTML = "";
    const currentSet = new Set(currentPermissions);
    for (const perm of ALL_AVAILABLE_PERMISSIONS) {
        const id = `perm-${perm.replace(/\s+/g, "-").toLowerCase()}`;
        const item = document.createElement("label");
        item.className = "modal-permission-item";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.value = perm;
        input.checked = currentSet.has(perm);
        const span = document.createElement("span");
        span.textContent = perm;
        item.appendChild(input);
        item.appendChild(span);
        modalPermissionsList.appendChild(item);
    }
    if (editModal) {
        editModal.hidden = false;
        const firstCb = modalPermissionsList.querySelector('input[type="checkbox"]');
        firstCb === null || firstCb === void 0 ? void 0 : firstCb.focus();
    }
}
function closeEditModal() {
    editingRole = null;
    if (editModal)
        editModal.hidden = true;
}
function getSelectedPermissionsFromModal() {
    if (!modalPermissionsList)
        return [];
    const checkboxes = modalPermissionsList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map((cb) => cb.value).filter(Boolean);
}
function handleEdit(role) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!role)
            return;
        let policies;
        try {
            policies = yield fetchPolicies();
        }
        catch (e) {
            alert(`Failed to load policies: ${e.message}`);
            return;
        }
        const policy = policies.find((p) => p.role.toLowerCase() === role.toLowerCase());
        if (!policy)
            return;
        openEditModal(policy.role, policy.permissions || []);
    });
}
function saveEditModal() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!editingRole)
            return;
        const permissions = getSelectedPermissionsFromModal();
        try {
            const res = yield fetch(`${API_BASE}/policies/${encodeURIComponent(editingRole)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions }),
            });
            if (!res.ok) {
                const err = yield res.text();
                alert(`Error: ${err || res.status}`);
                return;
            }
            closeEditModal();
            yield loadPolicies();
        }
        catch (e) {
            alert(`Error: ${e.message}`);
        }
    });
}
modalCancel === null || modalCancel === void 0 ? void 0 : modalCancel.addEventListener("click", closeEditModal);
modalOverlay === null || modalOverlay === void 0 ? void 0 : modalOverlay.addEventListener("click", closeEditModal);
modalSave === null || modalSave === void 0 ? void 0 : modalSave.addEventListener("click", () => void saveEditModal());
editModal === null || editModal === void 0 ? void 0 : editModal.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
        closeEditModal();
});
function handleDelete(role) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!role)
            return;
        if (!confirm(`Are you sure you want to delete the policy for "${role}"?`))
            return;
        try {
            const res = yield fetch(`${API_BASE}/policies/${encodeURIComponent(role)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const err = yield res.text();
                alert(`Error: ${err || res.status}`);
                return;
            }
            yield loadPolicies();
        }
        catch (e) {
            alert(`Error: ${e.message}`);
        }
    });
}
addPolicyBtn === null || addPolicyBtn === void 0 ? void 0 : addPolicyBtn.addEventListener("click", openAddModal);
logoutLink === null || logoutLink === void 0 ? void 0 : logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("mockSession");
    window.location.href = "../index.html";
});
loadPolicies();
//# sourceMappingURL=access-policy.js.map