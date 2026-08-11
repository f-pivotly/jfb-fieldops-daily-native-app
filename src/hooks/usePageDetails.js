import { useState, useCallback } from "react";
import { fetchPageDetails } from "../data";
import { useAppConfig } from "../contexts/appConfigContext";
import { getShellCache, setShellCache } from "../data/offlineDb";

const pageCacheKey = (pageSlug) => `page_resolve:${pageSlug}`;

export function usePageDetails() {
  const { config } = useAppConfig();
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slug, setSlug] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  const loadPage = useCallback(
    (pageSlug) => {
      if (!pageSlug || !config.appSlug) return;
      setSlug(pageSlug);
      setLoading(true);
      setError(null);
      setPageData(null);
      setFromCache(false);
      return fetchPageDetails(config.appSlug, pageSlug)
        .then((res) => {
          setPageData(res);
          setShellCache(pageCacheKey(pageSlug), res);
        })
        .catch((err) =>
          getShellCache(pageCacheKey(pageSlug)).then((cached) => {
            if (cached) {
              setPageData(cached);
              setFromCache(true);
            } else {
              setError(err.message);
            }
          }),
        )
        .finally(() => setLoading(false));
    },
    [config.appSlug],
  );

  return { pageData, loading, error, slug, loadPage, fromCache };
}
