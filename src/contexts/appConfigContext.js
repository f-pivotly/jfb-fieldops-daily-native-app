import { createContext, useContext } from "react";

export const AppConfigContext = createContext(null);

export function decodeJwtUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
    const email = payload.email || payload.preferred_username || payload.upn || ''
    const name = payload.name || email
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || '?'
    return { name, initials, email }
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
