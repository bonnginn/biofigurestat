import assert from "node:assert/strict";
import test from "node:test";

import { createTelemetryReleaseOverlay } from "./prepare_telemetry_release_config.mjs";

const validConfig = {
  d1_databases: [
    {
      binding: "DB",
      database_id: "123e4567-e89b-42d3-a456-426614174000",
    },
  ],
  vars: {
    ALLOWED_ORIGINS: "tauri://localhost,http://tauri.localhost,https://tauri.localhost",
    RETENTION_DAYS: "90",
  },
};

test("creates an exact-origin CSP overlay without writing the ingestion key", () => {
  const overlay = createTelemetryReleaseOverlay({
    endpoint: "https://telemetry.biofigurestat.example/v1/usage",
    ingestKey: "public-alpha-key_123456",
    privacyContact: "privacy@biofigurestat.example",
    wranglerConfig: validConfig,
  });
  const serialized = JSON.stringify(overlay);
  assert.match(
    serialized,
    /connect-src ipc: http:\/\/ipc\.localhost https:\/\/telemetry\.biofigurestat\.example/u,
  );
  assert.doesNotMatch(serialized, /public-alpha-key/u);
});

test("rejects placeholders, wildcard origins, unsafe endpoints, and missing operations ownership", () => {
  assert.throws(
    () =>
      createTelemetryReleaseOverlay({
        endpoint: "http://telemetry.example/v1/usage",
        ingestKey: "public-alpha-key_123456",
        privacyContact: "privacy@example.test",
        wranglerConfig: validConfig,
      }),
    /credential-free HTTPS/u,
  );
  assert.throws(
    () =>
      createTelemetryReleaseOverlay({
        endpoint: "https://telemetry.example/v1/usage",
        ingestKey: "public-alpha-key_123456",
        privacyContact: "",
        wranglerConfig: validConfig,
      }),
    /PRIVACY_CONTACT/u,
  );
  assert.throws(
    () =>
      createTelemetryReleaseOverlay({
        endpoint: "https://telemetry.example/v1/usage",
        ingestKey: "public-alpha-key_123456",
        privacyContact: "privacy@example.test",
        wranglerConfig: {
          ...validConfig,
          d1_databases: [{ binding: "DB", database_id: "REPLACE_AFTER_D1_CREATE" }],
        },
      }),
    /D1 database UUID/u,
  );
  assert.throws(
    () =>
      createTelemetryReleaseOverlay({
        endpoint: "https://telemetry.example/v1/usage",
        ingestKey: "public-alpha-key_123456",
        privacyContact: "privacy@example.test",
        wranglerConfig: {
          ...validConfig,
          vars: { ...validConfig.vars, ALLOWED_ORIGINS: "*" },
        },
      }),
    /wildcard/u,
  );
});
