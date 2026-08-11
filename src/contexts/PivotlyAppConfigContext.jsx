import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { api, applyAuthToken, applyAppSlug } from "../data";
import { onTokenUpdated, requestNewToken } from "../helpers/PivotlyHelpers";
import { getShellCache, setShellCache } from "../data/offlineDb";
import { AppConfigContext, decodeJwtUser, MSG } from "./appConfigContext";

const CONFIG_HANDSHAKE_TIMEOUT_MS = 3000;

export function PivotlyAppConfigProvider({ children }) {
  const [config, setConfig] = useState({
    authToken: null,
    appSlug: null,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    let settled = false;

    function applyConfig(authToken, appSlug, cached) {
      applyAuthToken(authToken);
      applyAppSlug(appSlug);
      setConfig({ authToken, appSlug, user: decodeJwtUser(authToken) });
      setReady(true);
      setFromCache(cached);
      setError(null);
    }

    function handleMessage(event) {
      if (!event.data?.type || event.data.type !== MSG.APP_CONFIG) return;

      const { authToken, appSlug } = event.data;

      if (!authToken || !appSlug) {
        if (!settled) {
          setError(
            `${MSG.APP_CONFIG} is missing required fields: authToken, appSlug`,
          );
        }
        return;
      }

      settled = true;
      applyConfig(authToken, appSlug, false);
      setShellCache("appConfig", { authToken, appSlug });
    }

    window.addEventListener("message", handleMessage);

    window.parent.postMessage({ type: MSG.APP_READY }, "*");

    const timeoutId = setTimeout(() => {
      if (settled) return;
      getShellCache("appConfig").then((cached) => {
        if (settled || !cached) return;
        settled = true;
        applyConfig(cached.authToken, cached.appSlug, true);
      });
    }, CONFIG_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    return onTokenUpdated((token) => {
      setConfig((prev) => ({ ...prev, authToken: token, user: decodeJwtUser(token) }));
    });
  }, []);

  const requestTokenRefresh = useCallback(() => {
    return requestNewToken(api);
  }, []);

  const value = useMemo(
    () => ({ config, ready, error, fromCache, requestTokenRefresh }),
    [config, ready, error, fromCache, requestTokenRefresh],
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}
