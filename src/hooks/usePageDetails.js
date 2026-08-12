import { useState, useCallback } from "react";
import { fetchPageDetails } from "../data";
import { useAppConfig } from "../contexts/appConfigContext";

export function usePageDetails() {
  const { config } = useAppConfig();
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slug, setSlug] = useState(null);

  const loadPage = useCallback(
    (pageSlug) => {
      if (!pageSlug || !config.appSlug) return;
      setSlug(pageSlug);
      setLoading(true);
      setError(null);
      setPageData(null);
      return fetchPageDetails(config.appSlug, pageSlug)
        .then((res) => setPageData(res))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [config.appSlug],
  );

  return { pageData, loading, error, slug, loadPage };
}
