import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CSP =
  "default-src 'self'; img-src 'self' asset: data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const REQUIRED_NATIVE_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

function requiredText(value, name) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${name} is required for a telemetry-enabled release.`);
  return normalized;
}

function validateEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(requiredText(value, "VITE_USAGE_TELEMETRY_ENDPOINT"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("is required")) throw error;
    throw new Error("VITE_USAGE_TELEMETRY_ENDPOINT must be an absolute HTTPS URL.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search ||
    endpoint.pathname !== "/v1/usage"
  ) {
    throw new Error(
      "VITE_USAGE_TELEMETRY_ENDPOINT must be a credential-free HTTPS URL ending exactly in /v1/usage.",
    );
  }
  return endpoint;
}

function validateWranglerConfig(config) {
  const database = config?.d1_databases?.[0];
  if (
    !database ||
    database.binding !== "DB" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      database.database_id ?? "",
    )
  ) {
    throw new Error("wrangler.jsonc must contain the deployed D1 database UUID bound as DB.");
  }
  const origins = new Set(
    String(config?.vars?.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if ([...origins].some((origin) => origin.includes("*"))) {
    throw new Error("ALLOWED_ORIGINS must not contain a wildcard.");
  }
  for (const origin of REQUIRED_NATIVE_ORIGINS) {
    if (!origins.has(origin)) throw new Error(`ALLOWED_ORIGINS is missing ${origin}.`);
  }
  const retentionDays = Number(config?.vars?.RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 365) {
    throw new Error("RETENTION_DAYS must be an integer from 7 through 365.");
  }
}

export function createTelemetryReleaseOverlay({
  endpoint,
  ingestKey,
  privacyContact,
  wranglerConfig,
}) {
  const validEndpoint = validateEndpoint(endpoint);
  if (
    !/^[A-Za-z0-9._-]{16,128}$/u.test(requiredText(ingestKey, "VITE_USAGE_TELEMETRY_INGEST_KEY"))
  ) {
    throw new Error(
      "VITE_USAGE_TELEMETRY_INGEST_KEY must contain 16-128 ASCII letters, numbers, dot, underscore, or hyphen.",
    );
  }
  const contact = requiredText(privacyContact, "BIOFIGURESTAT_PRIVACY_CONTACT");
  if (!contact.includes("@") && !/^https:\/\//u.test(contact)) {
    throw new Error("BIOFIGURESTAT_PRIVACY_CONTACT must be an email address or HTTPS URL.");
  }
  validateWranglerConfig(wranglerConfig);
  const endpointOrigin = validEndpoint.origin;
  return {
    app: {
      security: {
        csp: DEFAULT_CSP.replace(
          "connect-src ipc: http://ipc.localhost",
          `connect-src ipc: http://ipc.localhost ${endpointOrigin}`,
        ),
      },
    },
  };
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const wranglerPath = path.join(repositoryRoot, "apps", "telemetry-worker", "wrangler.jsonc");
  const wranglerConfig = JSON.parse(await fs.readFile(wranglerPath, "utf8"));
  const privacyContact = process.env.BIOFIGURESTAT_PRIVACY_CONTACT;
  const compiledPrivacyContact = requiredText(
    process.env.VITE_USAGE_TELEMETRY_PRIVACY_CONTACT,
    "VITE_USAGE_TELEMETRY_PRIVACY_CONTACT",
  );
  if (compiledPrivacyContact !== requiredText(privacyContact, "BIOFIGURESTAT_PRIVACY_CONTACT")) {
    throw new Error(
      "VITE_USAGE_TELEMETRY_PRIVACY_CONTACT must match BIOFIGURESTAT_PRIVACY_CONTACT.",
    );
  }
  const overlay = createTelemetryReleaseOverlay({
    endpoint: process.env.VITE_USAGE_TELEMETRY_ENDPOINT,
    ingestKey: process.env.VITE_USAGE_TELEMETRY_INGEST_KEY,
    privacyContact,
    wranglerConfig,
  });
  const outputPath = path.join(repositoryRoot, ".tmp", "telemetry-release-config.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
  console.log(`Telemetry release preflight PASS: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
