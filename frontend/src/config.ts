/**
 * API base URL for backend. Change for production.
 */
export const API_BASE =
  typeof window !== "undefined" && (window as any).PHI_SHIELD_API_BASE
    ? (window as any).PHI_SHIELD_API_BASE
    : "http://localhost:8000";
