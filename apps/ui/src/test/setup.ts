import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined" && typeof document.execCommand !== "function") {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => false,
  });
}

if (typeof window !== "undefined") {
  // Node 26 may expose an unavailable process-level localStorage even without
  // --localstorage-file. Do not read either ambient implementation here. Each
  // jsdom test environment gets an explicit in-memory Storage so Vitest workers
  // cannot share feature flags, consent, or worksheet preferences.
  const values = new Map<string, string>();
  const isolatedLocalStorage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(String(key)) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: isolatedLocalStorage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: isolatedLocalStorage,
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}
