export const PRODUCT_IDENTITY = {
  developmentName: "BioFigureStat",
  displayNameJa: "BioFigureStat",
  shortMark: "BFS",
  version: "0.1.0",
  expectedEngineVersion: "0.15.0",
  licenseStatus: "MIT License",
  repositoryUrl: "https://github.com/bonnginn/biofigurestat" as string | null,
  buildRevision: import.meta.env.VITE_LSAA_BUILD_REVISION?.trim() || "unavailable",
} as const;
