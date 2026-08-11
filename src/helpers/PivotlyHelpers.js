export function setAuthToken(axiosInstance, token) {
  if (token) {
    axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axiosInstance.defaults.headers.common["Authorization"];
  }
}

// ── Token-updated subscribers ─────────────────────────────────────────────────
// This module is the single owner of the REFRESH_AUTH_TOKEN /
// AUTH_TOKEN_UPDATED handshake. Other code (e.g. PivotlyAppConfigContext,
// which needs to update React state with the new token) subscribes here
// instead of running its own independent postMessage listener — that
// duplication previously meant a 401 could trigger one refresh cycle while
// something else triggered a second, uncoordinated one.
const subscribers = new Set();

export function onTokenUpdated(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ── Token refresh — singleton, outside React tree so axios interceptor can call it
// Concurrent 401s (and any other caller) share one in-flight refresh cycle
let refreshPromise = null;

export function requestNewToken(axiosInstance) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Token refresh timed out after 30s"));
    }, 30_000);

    function cleanup() {
      window.removeEventListener("message", handler);
      clearTimeout(timeout);
      refreshPromise = null;
    }

    function handler(event) {
      if (!event.data) return;
      if (
        event.data.type === "PIVOTLY_AUTH_TOKEN_UPDATED" &&
        event.data.token
      ) {
        cleanup();
        setAuthToken(axiosInstance, event.data.token);
        subscribers.forEach((fn) => fn(event.data.token));
        resolve(event.data.token);
      }
    }

    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "PIVOTLY_REFRESH_AUTH_TOKEN" }, "*");
  });

  return refreshPromise;
}
