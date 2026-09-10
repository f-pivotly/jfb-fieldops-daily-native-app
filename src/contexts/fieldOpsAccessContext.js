import { createContext, useContext } from "react";

export const FieldOpsAccessContext = createContext(null);

const NO_DOMAIN_ACCESS = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

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

export function useFieldOpsDomainAccess(domain) {
  const ctx = useFieldOpsAccessContext();
  if (ctx.isLoading) return NO_DOMAIN_ACCESS;
  return ctx.accessMap[domain] ?? NO_DOMAIN_ACCESS;
}

export function useFieldOpsAccessLoading() {
  return useFieldOpsAccessContext().isLoading;
}
