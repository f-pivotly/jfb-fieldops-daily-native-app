import { createContext, useContext } from "react";

export const AppConfigContext = createContext(null);

// ── Decode JWT payload for display-only user info (no verification) ──────────
export function decodeJwtUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
    const name = payload.name || payload.preferred_username || payload.email || ''
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || '?'
    return { name, initials, email: payload.email || '' }
  } catch {
    return { name: '', initials: '?', email: '' }
  }
}

// ── postMessage event types shared between iframe and parent ─────────────────
export const MSG = {
  // Iframe → Parent
  APP_READY: "PIVOTLY_APP_READY",
  REFRESH_AUTH_TOKEN: "PIVOTLY_REFRESH_AUTH_TOKEN",
  // Parent → Iframe
  APP_CONFIG: "PIVOTLY_APP_CONFIG",
  AUTH_TOKEN_UPDATED: "PIVOTLY_AUTH_TOKEN_UPDATED",
};

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx)
    throw new Error(
      "useAppConfig must be used within PivotlyAppConfigProvider",
    );
  return ctx;
}
