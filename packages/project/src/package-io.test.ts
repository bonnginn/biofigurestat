import { describe, expect, it } from "vitest";
import {
  openProjectPackage,
  saveProjectPackage,
  type AtomicProjectWrite,
  type ProjectPackageStorage,
} from "./package-io";
import { PROJECT_FORMAT_VERSION, ProjectManifestSchema } from "./index";

const encoder = new TextEncoder();
const fakeSha256 = async (data: Uint8Array) => data.byteLength.toString(16).padStart(64, "0");

class MemoryStorage implements ProjectPackageStorage {
  packages = new Map<string, Map<string, Uint8Array>>();
  failOnPath: string | null = null;

  async readFile(target: string, relativePath: string) {
    const data = this.packages.get(target)?.get(relativePath);
    if (!data) throw new Error(`Missing ${relativePath}`);
    return data;
  }

  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    const staged = new Map<string, Uint8Array>();
    return {
      writeFile: async (path, data) => {
        if (path === this.failOnPath) throw new Error("simulated write failure");
        staged.set(path, data);
      },
      commit: async () => {
        this.packages.set(target, staged);
      },
      rollback: async () => {
        staged.clear();
      },
    };
  }
}

async function fixture() {
  const database = encoder.encode("sqlite fixture");
  const raw = encoder.encode("condition,value\ncontrol,1\n");
  const manifest = ProjectManifestSchema.parse({
    format: "life-science-analysis-project",
    formatVersion: PROJECT_FORMAT_VERSION,
    projectId: "project.roundtrip",
    metadata: {
      projectId: "project.roundtrip",
      projectName: "Round trip",
      experimentDate: "2026-08-20",
      createdAt: "2026-08-20T12:00:00+09:00",
      updatedAt: "2026-08-20T12:00:00+09:00",
    },
    appVersion: "0.1.0",
    schemaVersions: { design: "0.2.0", data: "0.1.0", analysis: "0.1.0", graph: "0.1.0" },
    createdAt: "2026-08-20T12:00:00+09:00",
    savedAt: "2026-08-20T12:00:00+09:00",
    files: [
      {
        path: "project.sqlite",
        role: "database",
        sha256: await fakeSha256(database),
        sizeBytes: database.byteLength,
      },
      {
        path: "raw/exports/observations.csv",
        role: "raw_export",
        sha256: await fakeSha256(raw),
        sizeBytes: raw.byteLength,
      },
    ],
    recovery: {
      canonicalRawExportPath: "raw/exports/observations.csv",
      databasePath: "project.sqlite",
    },
  });
  return {
    manifest,
    payloads: { "project.sqlite": database, "raw/exports/observations.csv": raw },
  };
}

describe("project package I/O contract", () => {
  it("round-trips a validated transparent package", async () => {
    const storage = new MemoryStorage();
    const { manifest, payloads } = await fixture();
    await saveProjectPackage(storage, "example.lsa", manifest, payloads, fakeSha256);

    const opened = await openProjectPackage(storage, "example.lsa", fakeSha256);
    expect(opened.manifest.projectId).toBe("project.roundtrip");
    expect(new TextDecoder().decode(opened.files["raw/exports/observations.csv"])).toContain(
      "control,1",
    );
  });

  it("does not replace the last good project when a staged write fails", async () => {
    const storage = new MemoryStorage();
    const { manifest, payloads } = await fixture();
    await saveProjectPackage(storage, "example.lsa", manifest, payloads, fakeSha256);
    const lastGoodManifest = storage.packages.get("example.lsa")?.get("manifest.json");

    storage.failOnPath = "raw/exports/observations.csv";
    await expect(
      saveProjectPackage(storage, "example.lsa", manifest, payloads, fakeSha256),
    ).rejects.toThrow("simulated write failure");

    expect(storage.packages.get("example.lsa")?.get("manifest.json")).toBe(lastGoodManifest);
  });

  it("rejects corrupted content during open", async () => {
    const storage = new MemoryStorage();
    const { manifest, payloads } = await fixture();
    await saveProjectPackage(storage, "example.lsa", manifest, payloads, fakeSha256);
    storage.packages
      .get("example.lsa")
      ?.set("raw/exports/observations.csv", encoder.encode("corrupted"));

    await expect(openProjectPackage(storage, "example.lsa", fakeSha256)).rejects.toThrow(
      "failed integrity validation",
    );
  });
});
