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

export default defineConfig(() => {
  const evaluationProxy = createEvaluationProxy(process.env);
  return {
    base: "./",
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
      allowedHosts: [".trycloudflare.com"],
      proxy: evaluationProxy ? { "/api/evaluation": evaluationProxy } : undefined,
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      allowedHosts: [".trycloudflare.com"],
    },
  };
});
