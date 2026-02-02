/**
 * Access Policy Management — load/save policies via backend API.
 */
import { API_BASE } from "./config.js";

// Check if user is logged in
const session = localStorage.getItem("mockSession");
if (!session) {
  window.location.href = "../index.html";
}

interface Policy {
  role: string;
  permissions: string[];
  last_updated: string;
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

const policyRows = document.getElementById("policy-rows") as HTMLDivElement;
const addPolicyBtn = document.querySelector(".add-policy-btn") as HTMLButtonElement;
const logoutLink = document.querySelector('a[href="../index.html"]') as HTMLAnchorElement;

const editModal = document.getElementById("edit-permissions-modal") as HTMLElement;
const modalRoleLabel = document.getElementById("modal-role-label") as HTMLElement;
const modalPermissionsList = document.getElementById("modal-permissions-list") as HTMLDivElement;
const modalCancel = document.getElementById("modal-cancel") as HTMLButtonElement;
const modalSave = document.getElementById("modal-save") as HTMLButtonElement;
const modalOverlay = document.getElementById("modal-overlay") as HTMLElement;

const addModal = document.getElementById("add-policy-modal") as HTMLElement;
const addModalRoleInput = document.getElementById("add-modal-role") as HTMLInputElement;
const addModalPermissionsList = document.getElementById("add-modal-permissions-list") as HTMLDivElement;
const addModalCancel = document.getElementById("add-modal-cancel") as HTMLButtonElement;
const addModalSave = document.getElementById("add-modal-save") as HTMLButtonElement;
const addModalOverlay = document.getElementById("add-modal-overlay") as HTMLElement;

let editingRole: string | null = null;

function renderPolicies(policies: Policy[]): void {
  if (!policyRows) return;
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
    btn.addEventListener("click", () => handleEdit((btn as HTMLButtonElement).dataset.role ?? ""));
  });
  policyRows.querySelectorAll(".action-btn.delete").forEach((btn) => {
    btn.addEventListener("click", () => handleDelete((btn as HTMLButtonElement).dataset.role ?? ""));
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function fetchPolicies(): Promise<Policy[]> {
  const res = await fetch(`${API_BASE}/policies`);
  if (!res.ok) throw new Error(`Failed to load policies: ${res.status}`);
  return res.json();
}

async function loadPolicies(): Promise<void> {
  try {
    const policies = await fetchPolicies();
    renderPolicies(policies);
  } catch (e) {
    policyRows.innerHTML = `<div class="row"><div colspan="4" style="padding: 16px; color: #b91c1c;">Failed to load policies. Is the backend running at ${API_BASE}?</div></div>`;
  }
}

function openAddModal(): void {
  if (addModalRoleInput) addModalRoleInput.value = "";
  if (!addModalPermissionsList) return;
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
    addModalRoleInput?.focus();
  }
}

function closeAddModal(): void {
  if (addModal) addModal.hidden = true;
}

function getSelectedPermissionsFromAddModal(): string[] {
  if (!addModalPermissionsList) return [];
  const checkboxes = addModalPermissionsList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map((cb) => cb.value).filter(Boolean);
}

async function saveAddModal(): Promise<void> {
  const role = addModalRoleInput?.value?.trim() ?? "";
  if (!role) {
    alert("Please enter a role name.");
    addModalRoleInput?.focus();
    return;
  }
  const permissions = getSelectedPermissionsFromAddModal();
  try {
    const res = await fetch(`${API_BASE}/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, permissions }),
    });
    if (!res.ok) {
      const err = await res.text();
      alert(`Error: ${err || res.status}`);
      return;
    }
    closeAddModal();
    await loadPolicies();
  } catch (e) {
    alert(`Error: ${(e as Error).message}`);
  }
}

addModalCancel?.addEventListener("click", closeAddModal);
addModalOverlay?.addEventListener("click", closeAddModal);
addModalSave?.addEventListener("click", () => void saveAddModal());

addModal?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAddModal();
});

function openEditModal(role: string, currentPermissions: string[]): void {
  editingRole = role;
  if (modalRoleLabel) modalRoleLabel.textContent = `Role: ${role}`;
  if (!modalPermissionsList) return;
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
    const firstCb = modalPermissionsList.querySelector('input[type="checkbox"]') as HTMLInputElement;
    firstCb?.focus();
  }
}

function closeEditModal(): void {
  editingRole = null;
  if (editModal) editModal.hidden = true;
}

function getSelectedPermissionsFromModal(): string[] {
  if (!modalPermissionsList) return [];
  const checkboxes = modalPermissionsList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map((cb) => cb.value).filter(Boolean);
}

async function handleEdit(role: string): Promise<void> {
  if (!role) return;
  let policies: Policy[];
  try {
    policies = await fetchPolicies();
  } catch (e) {
    alert(`Failed to load policies: ${(e as Error).message}`);
    return;
  }
  const policy = policies.find((p) => p.role.toLowerCase() === role.toLowerCase());
  if (!policy) return;
  openEditModal(policy.role, policy.permissions || []);
}

async function saveEditModal(): Promise<void> {
  if (!editingRole) return;
  const permissions = getSelectedPermissionsFromModal();
  try {
    const res = await fetch(`${API_BASE}/policies/${encodeURIComponent(editingRole)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) {
      const err = await res.text();
      alert(`Error: ${err || res.status}`);
      return;
    }
    closeEditModal();
    await loadPolicies();
  } catch (e) {
    alert(`Error: ${(e as Error).message}`);
  }
}

modalCancel?.addEventListener("click", closeEditModal);
modalOverlay?.addEventListener("click", closeEditModal);
modalSave?.addEventListener("click", () => void saveEditModal());

editModal?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEditModal();
});

async function handleDelete(role: string): Promise<void> {
  if (!role) return;
  if (!confirm(`Are you sure you want to delete the policy for "${role}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/policies/${encodeURIComponent(role)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.text();
      alert(`Error: ${err || res.status}`);
      return;
    }
    await loadPolicies();
  } catch (e) {
    alert(`Error: ${(e as Error).message}`);
  }
}

addPolicyBtn?.addEventListener("click", openAddModal);

logoutLink?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("mockSession");
  window.location.href = "../index.html";
});

loadPolicies();
