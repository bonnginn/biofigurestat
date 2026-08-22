import { describe, expect, it } from "vitest";
import { PROJECT_FORMAT_VERSION, ProjectManifestSchema } from "./index";

describe("ProjectManifestSchema", () => {
  const validManifest = {
    format: "life-science-analysis-project",
    formatVersion: PROJECT_FORMAT_VERSION,
    projectId: "project.example",
    metadata: {
      projectId: "project.example",
      projectName: "Example",
      experimentDate: "2026-08-20",
      createdAt: "2026-08-20T12:00:00+09:00",
      updatedAt: "2026-08-20T12:00:00+09:00",
    },
    appVersion: "0.0.0",
    schemaVersions: {
      design: "0.2.0",
      data: "0.1.0",
      analysis: "0.1.0",
      graph: "0.1.0",
    },
    createdAt: "2026-08-20T12:00:00+09:00",
    savedAt: "2026-08-20T12:00:00+09:00",
    files: [
      {
        path: "project.sqlite",
        role: "database",
        sha256: "a".repeat(64),
        sizeBytes: 128,
      },
      {
        path: "raw/exports/observations.csv",
        role: "raw_export",
        sha256: "b".repeat(64),
        sizeBytes: 256,
      },
    ],
    recovery: {
      canonicalRawExportPath: "raw/exports/observations.csv",
      databasePath: "project.sqlite",
    },
  } as const;

  it("parses a minimal transparent project manifest", () => {
    const manifest = ProjectManifestSchema.parse(validManifest);

    expect(manifest.recovery.canonicalRawExportPath).toBe("raw/exports/observations.csv");
  });

  it("rejects paths that escape the transparent package", () => {
    const result = ProjectManifestSchema.safeParse({
      ...validManifest,
      files: [{ ...validManifest.files[0], path: "../project.sqlite" }, validManifest.files[1]],
      recovery: { ...validManifest.recovery, databasePath: "../project.sqlite" },
    });

    expect(result.success).toBe(false);
  });

  it("requires recovery paths to reference declared files with the correct roles", () => {
    const result = ProjectManifestSchema.safeParse({
      ...validManifest,
      recovery: { ...validManifest.recovery, canonicalRawExportPath: "missing.csv" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects mismatched project IDs and duplicate package paths", () => {
    const result = ProjectManifestSchema.safeParse({
      ...validManifest,
      metadata: { ...validManifest.metadata, projectId: "project.other" },
      files: [...validManifest.files, validManifest.files[0]],
    });

    expect(result.success).toBe(false);
  });

  it("rejects reserved, backslash, and case-colliding paths for cross-platform safety", () => {
    const result = ProjectManifestSchema.safeParse({
      ...validManifest,
      files: [
        ...validManifest.files,
        { ...validManifest.files[0], path: "manifest.json" },
        { ...validManifest.files[0], path: "Raw\\source.csv" },
        { ...validManifest.files[0], path: "PROJECT.SQLITE" },
      ],
    });

    expect(result.success).toBe(false);
  });
});
