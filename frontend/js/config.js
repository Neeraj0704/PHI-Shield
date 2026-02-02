/**
 * API base URL for backend. Change for production.
 */
export const API_BASE = typeof window !== "undefined" && window.PHI_SHIELD_API_BASE
    ? window.PHI_SHIELD_API_BASE
    : "http://localhost:8000";
//# sourceMappingURL=config.js.map