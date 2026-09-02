import { createContext, useContext } from "react";

export const AdminAccessContext = createContext(null);

export const NO_ACCESS = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

export function useDomainAccess(domain) {
  const ctx = useContext(AdminAccessContext);
  if (!ctx) {
    throw new Error("useDomainAccess must be used within AdminAccessProvider");
  }
  if (ctx.isLoading) return NO_ACCESS;
  return ctx.accessMap[domain] ?? NO_ACCESS;
}
