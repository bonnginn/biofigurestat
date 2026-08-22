import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Several interaction-heavy jsdom suites contend for one CPU when every file runs at once.
    // Keep enough parallelism for feedback while preserving the normal per-test timeout signal.
    maxWorkers: 2,
  },
});
