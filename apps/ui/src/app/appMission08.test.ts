import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleProjectPackage, encodeProjectManifest, ProjectStateSchema } from "@lsaa/project";
import { describe, expect, it } from "vitest";

const rerun = process.env.BIOFIGURESTAT_APP08_PHASE === "rerun";
const base = path.resolve(import.meta.dirname, "../../.app-mission08");
const qa = rerun ? path.join(base, "rerun") : base;
const source = rerun
  ? path.join(base, "rerun-state.json")
  : path.resolve(import.meta.dirname, "../../.engine-roundtrip07/project-state.json");
describe.skipIf(process.env.BIOFIGURESTAT_APP08_ACCEPTANCE !== "1")(
  "APP08 production container fixture",
  () => {
    it("prepares the existing production package payloads for native backend I/O", async () => {
      mkdirSync(qa, { recursive: true });
      const state = ProjectStateSchema.parse(JSON.parse(readFileSync(source, "utf8")));
      const sha256 = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      const assembled = await assembleProjectPackage(
        state,
        new Uint8Array(),
        sha256,
        "0.1.0",
        state.metadata.updatedAt,
      );
      writeFileSync(path.join(qa, "state.json"), JSON.stringify(state, null, 2));
      writeFileSync(
        path.join(qa, "manifest-template.json"),
        encodeProjectManifest(assembled.manifest),
      );
      for (const [name, bytes] of Object.entries(assembled.payloads)) {
        if (name === "project.sqlite") continue;
        const destination = path.join(qa, name);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      expect(assembled.manifest.projectKind).toBe("experiment");
      expect(state.analysisRuns[0]!.result.engine.name).toBe("lsaa-python");
    });
  },
);
