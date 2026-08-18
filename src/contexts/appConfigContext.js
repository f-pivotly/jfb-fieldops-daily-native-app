import { createContext, useContext } from "react";

export const AppConfigContext = createContext(null);

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
    // No `id` here: sub/oid are opaque external-identity-provider subject
    // identifiers, not the platform's internal user UUID (confirmed via a
    // live "invalid input syntax for type uuid" failure) -- the resolved
    // UUID only comes from GET /me (see fetchCurrentUser in ../data),
    // populated separately by PivotlyAppConfigContext.
    return { name, initials, email: payload.email || '' }
  } catch {
    return { name: '', initials: '?', email: '' }
  }
}

export const MSG = {
  APP_READY: "PIVOTLY_APP_READY",
  REFRESH_AUTH_TOKEN: "PIVOTLY_REFRESH_AUTH_TOKEN",
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
