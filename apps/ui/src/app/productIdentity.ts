export const PRODUCT_IDENTITY = {
  developmentName: "Life Science Analysis App",
  displayNameJa: "ライフサイエンス解析",
  shortMark: "LS",
  version: "0.1.0",
  expectedEngineVersion: "0.7.0",
  licenseStatus: "Alpha testing license not yet selected",
  repositoryUrl: null as string | null,
  buildRevision: import.meta.env.VITE_LSAA_BUILD_REVISION?.trim() || "unavailable",
} as const;
