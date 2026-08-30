import { describe, expect, it, vi } from "vitest";

import { createEvaluationProxy } from "./vite.config";

describe("evaluation same-origin proxy", () => {
  it("is absent unless the complete development-only server configuration is present", () => {
    expect(createEvaluationProxy({})).toBeUndefined();
    expect(
      createEvaluationProxy({
        VITE_LSAA_EVALUATION_MODE: "true",
        LSAA_EVALUATION_BRIDGE_TARGET: "https://external.example",
        LSAA_EVALUATION_BRIDGE_TOKEN: "secret",
        LSAA_EVALUATION_BRIDGE_ORIGIN: "http://127.0.0.1:1420",
      }),
    ).toBeUndefined();
  });

  it("keeps the bridge loopback-only and injects authorization on the Mac-side proxy", () => {
    const proxy = createEvaluationProxy({
      VITE_LSAA_EVALUATION_MODE: "true",
      LSAA_EVALUATION_BRIDGE_TARGET: "http://127.0.0.1:43128",
      LSAA_EVALUATION_BRIDGE_TOKEN: "server-only-token",
      LSAA_EVALUATION_BRIDGE_ORIGIN: "http://127.0.0.1:1420",
    });
    expect(proxy).toMatchObject({ target: "http://127.0.0.1:43128", changeOrigin: false });

    let proxyRequestHandler:
      ((request: { setHeader: (name: string, value: string) => void }) => void) | null = null;
    proxy?.configure?.(
      {
        on: (event: string, handler: typeof proxyRequestHandler) => {
          if (event === "proxyReq") proxyRequestHandler = handler;
        },
      } as never,
      {} as never,
    );
    const setHeader = vi.fn();
    expect(proxyRequestHandler).not.toBeNull();
    (proxyRequestHandler as NonNullable<typeof proxyRequestHandler>)({ setHeader });
    expect(setHeader).toHaveBeenCalledWith("Authorization", "Bearer server-only-token");
    expect(setHeader).toHaveBeenCalledWith("Origin", "http://127.0.0.1:1420");
  });
});
