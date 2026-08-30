import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Native release gates run on slower developer laptops as well as CI.
    // Keep genuine infinite update loops visible while allowing the heaviest
    // end-to-end jsdom scenarios to finish across platforms.
    testTimeout: 15_000,
    // The default reporter can remain silent for several minutes in a large
    // non-interactive run. Per-test progress makes a stalled native gate
    // distinguishable from a slow but healthy suite.
    reporters: ["verbose"],
    // Several interaction-heavy jsdom suites contend for one CPU when every file runs at once.
    // Keep enough parallelism for feedback while preserving the normal per-test timeout signal.
    maxWorkers: 2,
  },
});
