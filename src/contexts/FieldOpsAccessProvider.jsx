import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "./appConfigContext";
import { FieldOpsAccessContext } from "./fieldOpsAccessContext";
import { fetchPageDetails } from "../data";

const FIELDOPS_PAGE_SLUG = "apg-jfb-fieldops";

// Resolves the apg-jfb-fieldops page once per FieldOps session and exposes
// each declared action's resolved `enabled` flag (e.g. manage_team,
// view_operator_hours) — the same page-resolve response useVisibleProjects
// already needed, now shared instead of re-fetched per hook.
export function FieldOpsAccessProvider({ children }) {
  const { config, ready } = useAppConfig();
  const [actionMap, setActionMap] = useState({});
  const [accessMap, setAccessMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!ready || !config.appSlug) return;
    let cancelled = false;

    fetchPageDetails(config.appSlug, FIELDOPS_PAGE_SLUG)
      .then((res) => {
        if (cancelled) return;
        const actions = res?.data?.actions ?? [];
        const map = {};
        for (const a of actions) {
          if (a?.action_key) map[a.action_key] = !!a.enabled;
        }
        setActionMap(map);

        const dataAccess = res?.data?.data_access ?? [];
        const domainMap = {};
        for (const entry of dataAccess) {
          if (entry?.domain) {
            domainMap[entry.domain] = {
              canRead: !!entry.read,
              canCreate: !!entry.create,
              canUpdate: !!entry.update,
              canDelete: !!entry.delete,
            };
          }
        }
        setAccessMap(domainMap);
      })
      .catch(() => {
        // Fail closed: leave actionMap/accessMap empty (everything resolves to false).
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, config.appSlug]);

  const value = useMemo(() => ({ actionMap, accessMap, isLoading }), [actionMap, accessMap, isLoading]);

  return (
    <FieldOpsAccessContext.Provider value={value}>
      {children}
    </FieldOpsAccessContext.Provider>
  );
}
