export function setAuthToken(axiosInstance, token) {
  if (token) {
    axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axiosInstance.defaults.headers.common["Authorization"];
  }
}

const subscribers = new Set();

export function onTokenUpdated(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

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
