import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

export function createEvaluationProxy(environment: NodeJS.ProcessEnv): ProxyOptions | undefined {
  const target = environment.LSAA_EVALUATION_BRIDGE_TARGET;
  const token = environment.LSAA_EVALUATION_BRIDGE_TOKEN;
  const bridgeOrigin = environment.LSAA_EVALUATION_BRIDGE_ORIGIN;
  if (
    environment.VITE_LSAA_EVALUATION_MODE !== "true" ||
    !target?.startsWith("http://127.0.0.1:") ||
    !token ||
    !bridgeOrigin?.startsWith("http://127.0.0.1:")
  ) {
    return undefined;
  }
  return {
    target,
    changeOrigin: false,
    configure(proxy) {
      proxy.on("proxyReq", (proxyRequest) => {
        proxyRequest.setHeader("Authorization", `Bearer ${token}`);
        proxyRequest.setHeader("Origin", bridgeOrigin);
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const evaluationProxy = createEvaluationProxy(process.env);
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  const productionBenchmarkRuntime = path
    .join(repositoryRoot, "apps/ui/src/app/productionBenchmarkRuntime.ts")
    .replaceAll("\\", "/");
  return {
    base: "./",
    plugins: [react()],
    resolve:
      command === "build"
        ? {
            alias: [
              {
                find: /^.*\/benchmarkEvaluation$/,
                replacement: productionBenchmarkRuntime,
              },
            ],
          }
        : undefined,
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
      allowedHosts: [".trycloudflare.com"],
      proxy: evaluationProxy ? { "/api/evaluation": evaluationProxy } : undefined,
      fs: evaluationProxy
        ? {
            strict: true,
            allow: [
              path.join(repositoryRoot, "apps/ui"),
              path.join(repositoryRoot, "packages"),
              path.join(repositoryRoot, "node_modules"),
            ],
            deny: ["**/benchmark/**", "**/benchmark_runs/**", "**/.git/**", "**/scripts/**"],
          }
        : undefined,
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      allowedHosts: [".trycloudflare.com"],
    },
    build: { sourcemap: false },
  };
});
