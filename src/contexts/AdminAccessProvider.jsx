import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "./appConfigContext";
import { AdminAccessContext } from "./adminAccessContext";
import { fetchPageDetails } from "../data";

const ADMIN_PAGE_SLUG = "apg-jfb-admin";

export function AdminAccessProvider({ children }) {
  const { config, ready } = useAppConfig();
  const [accessMap, setAccessMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!ready || !config.appSlug) return;
    let cancelled = false;

    fetchPageDetails(config.appSlug, ADMIN_PAGE_SLUG)
      .then((res) => {
        if (cancelled) return;
        const dataAccess = res?.data?.data_access ?? [];
        const map = {};
        for (const entry of dataAccess) {
          if (entry?.domain) {
            map[entry.domain] = {
              canRead: !!entry.read,
              canCreate: !!entry.create,
              canUpdate: !!entry.update,
              canDelete: !!entry.delete,
            };
          }
        }
        setAccessMap(map);
      })
      .catch(() => {
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, config.appSlug]);

  const value = useMemo(() => ({ accessMap, isLoading }), [accessMap, isLoading]);

  return (
    <AdminAccessContext.Provider value={value}>
      {children}
    </AdminAccessContext.Provider>
  );
}
