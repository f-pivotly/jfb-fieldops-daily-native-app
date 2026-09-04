import { createContext, useContext } from "react";

export const FieldOpsAccessContext = createContext(null);

export const NO_DOMAIN_ACCESS = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

// Resolves once, from the apg-jfb-fieldops page's declared `actions` array
// (each action's `enabled` comes from checking its required_claim server-side).
// Fails closed: while loading, or for any action not yet resolved, false.
function useFieldOpsAccessContext() {
  const ctx = useContext(FieldOpsAccessContext);
  if (!ctx) {
    throw new Error("must be used within FieldOpsAccessProvider");
  }
  return ctx;
}

export function useFieldOpsAction(actionKey) {
  const ctx = useFieldOpsAccessContext();
  if (ctx.isLoading) return false;
  return !!ctx.actionMap[actionKey];
}

// Same page-resolve response's `data_access` array (DAC-backed), for domains
// declared on apg-jfb-fieldops — mirrors adminAccessContext's useDomainAccess.
export function useFieldOpsDomainAccess(domain) {
  const ctx = useFieldOpsAccessContext();
  if (ctx.isLoading) return NO_DOMAIN_ACCESS;
  return ctx.accessMap[domain] ?? NO_DOMAIN_ACCESS;
}

// Distinct from useFieldOpsAction's boolean (which collapses "still loading"
// into false) — callers that need to avoid a false-then-true flash while the
// page resolve is in flight (e.g. useVisibleProjects) can check this first.
export function useFieldOpsAccessLoading() {
  return useFieldOpsAccessContext().isLoading;
}
