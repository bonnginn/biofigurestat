import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined" && typeof document.execCommand !== "function") {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => false,
  });
}

if (typeof window !== "undefined") {
  // Node 26 exposes a process-level localStorage when --localstorage-file is
  // present. Vitest workers must never share that file-backed state: feature
  // flags and consent are browser-window state and each jsdom environment
  // already provides an isolated implementation.
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}
