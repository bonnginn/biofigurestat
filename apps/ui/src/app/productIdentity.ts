export const PRODUCT_IDENTITY = {
  developmentName: "BioFigureStat",
  displayNameJa: "BioFigureStat",
  shortMark: "BFS",
  version: "0.1.0",
  expectedEngineVersion: "0.14.0",
  licenseStatus: "Alpha testing license not yet selected",
  repositoryUrl: "https://github.com/bonnginn/life-science-analysis-app" as string | null,
  buildRevision: import.meta.env.VITE_LSAA_BUILD_REVISION?.trim() || "unavailable",
} as const;
