import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { api, applyAuthToken, applyAppSlug, fetchCurrentUser } from "../data";
import { onTokenUpdated, requestNewToken } from "../helpers/pivotlyHelpers";
import { AppConfigContext, decodeJwtUser, MSG } from "./appConfigContext";

const CONFIG_HANDSHAKE_TIMEOUT_MS = 3000;

// Backfills the platform's internal user UUID once GET /me resolves --
// decodeJwtUser can't provide it (see appConfigContext.js). Non-fatal on
// failure: uploaded_by-type fields are nullable, so callers just don't get
// attribution rather than breaking.
function resolveCurrentUserId(setConfig) {
  fetchCurrentUser()
    .then((me) => {
      if (!me?.id) return;
      setConfig((prev) => ({ ...prev, user: { ...prev.user, id: me.id } }));
    })
    .catch(() => {});
}

export function PivotlyAppConfigProvider({ children }) {
  const [config, setConfig] = useState({
    authToken: null,
    appSlug: null,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let settled = false;

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
      applyAuthToken(authToken);
      applyAppSlug(appSlug);
      setConfig({ authToken, appSlug, user: decodeJwtUser(authToken) });
      resolveCurrentUserId(setConfig);
      setReady(true);
      setError(null);
    }

    window.addEventListener("message", handleMessage);

    window.parent.postMessage({ type: MSG.APP_READY }, "*");

    const timeoutId = setTimeout(() => {
      if (settled) return;
      setError("No configuration received from parent — check connection.");
    }, CONFIG_HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    return onTokenUpdated((token) => {
      setConfig((prev) => ({ ...prev, authToken: token, user: decodeJwtUser(token) }));
      resolveCurrentUserId(setConfig);
    });
  }, []);

  const requestTokenRefresh = useCallback(() => {
    return requestNewToken(api);
  }, []);

  const value = useMemo(
    () => ({ config, ready, error, requestTokenRefresh }),
    [config, ready, error, requestTokenRefresh],
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}
