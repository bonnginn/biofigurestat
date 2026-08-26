import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined" && typeof document.execCommand !== "function") {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: () => false,
  });
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}
