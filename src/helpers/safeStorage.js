const memoryFallback = new Map();

export function safeGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryFallback.has(key) ? memoryFallback.get(key) : null;
  }
}

export function safeSetItem(key, value) {
  const str = String(value);
  try {
    window.localStorage.setItem(key, str);
  } catch {
    memoryFallback.set(key, str);
  }
}
