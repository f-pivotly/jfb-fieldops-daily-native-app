import { useState, useEffect } from "react";
import { fetchNavItems } from "../data";
import { useAppConfig } from "../contexts/appConfigContext";

export function useNav() {
  const { config } = useAppConfig();
  const [navItems, setNavItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!config.appSlug) return;
    fetchNavItems(config.appSlug)
      .then((data) => setNavItems(data ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [config.appSlug]);

  const apiMenuItems = navItems.filter((n) => n.show_in_menu && n.visible);

  const menuItems = [...apiMenuItems].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const defaultItem = null;

  return { navItems, menuItems, defaultItem, loading, error };
}
