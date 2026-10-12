import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  appendMatrixView,
  ProjectStateSchema,
  PersistedMatrixViewSchema,
  openProjectPackage,
} from "@lsaa/project";
import { createHeatmapGraphSpec } from "@lsaa/graph-spec";
import { describe, expect, it } from "vitest";

describe.skipIf(process.env.BIOFIGURESTAT_APP08_ACCEPTANCE !== "1")(
  "APP08 R3 save contract",
  () => {
    it.skipIf(process.env.BIOFIGURESTAT_APP08_VERIFY_V5 !== "1")(
      "validates the actual v5 container and restores its complete state",
      async () => {
        const base = path.resolve(import.meta.dirname, "../../.app-mission08");
        const latest = readdirSync(base)
          .filter((name) => name.startsWith("v5-"))
          .sort()
          .at(-1)!;
        const qa = path.join(base, latest);
        const python = path.resolve(
          import.meta.dirname,
          "../../../../engine/python/.venv/Scripts/python.exe",
        );
        const encoded = execFileSync(
          python,
          [
            "-c",
            "import sqlite3,base64,json,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(json.dumps({p:base64.b64encode(d).decode() for p,d in c.execute('select path,data from container_entries')}))",
            path.join(qa, "matrix-v5.lsa"),
          ],
          { encoding: "utf8" },
        );
        const payloads = Object.fromEntries(
          Object.entries(JSON.parse(encoded) as Record<string, string>).map(([name, value]) => [
            name,
            Uint8Array.from(Buffer.from(value, "base64")),
          ]),
        );
        const opened = await openProjectPackage(
          {
            readFile: async (_target, relativePath) => payloads[relativePath]!,
            beginAtomicWrite: async () => {
              throw new Error("Read-only QA");
            },
          },
          "candidate-v5.lsa",
          async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        );
        expect(opened.manifest.recovery.databasePath).toBe("project.sqlite");
        const reopened = ProjectStateSchema.parse(
          JSON.parse(readFileSync(path.join(qa, "reopened-state.json"), "utf8")),
        );
        const expected = ProjectStateSchema.parse(
          JSON.parse(readFileSync(path.join(base, "save-contract/matrix-state.json"), "utf8")),
        );
        expect(reopened).toEqual(expected);
      },
    );
    it("retains immutable matrix input separately from display transforms in the existing state contract", () => {
      const qa = path.resolve(import.meta.dirname, "../../.app-mission08/save-contract");
      mkdirSync(qa, { recursive: true });
      const state = ProjectStateSchema.parse(
        JSON.parse(readFileSync(path.join(qa, "../state.json"), "utf8")),
      );
      const rawMatrix = {
        version: "0.1.0" as const,
        rowIds: ["feature.1", "feature.2"],
        rowLabels: ["Feature 1", "Feature 2"],
        columnIds: ["column.1", "column.2"],
        columnLabels: ["Column 1", "Column 2"],
        values: [
          [1, null],
          [2, 4],
        ],
      };
      const before = JSON.stringify(state);
      const matrix = appendMatrixView(state, {
        id: "matrix.qa.r2",
        rawMatrix,
        actor: "anonymous QA",
        createdAt: state.metadata.updatedAt,
        spec: createHeatmapGraphSpec({
          graphId: "graph.matrix.qa.r2",
          dataSource: {
            kind: "raw_revision",
            id: state.activeRawRevisionId,
            revision: state.activeRawRevisionId,
          },
          transform: "row_z_score",
          missingColor: "#cccccc",
        }),
      });
      expect(matrix.matrixViews?.[0]?.rawMatrix).toEqual(rawMatrix);
      expect(matrix.matrixViews?.[0]?.spec.heatmap?.transformVersion).toBe("0.1.0");
      expect(matrix.observations).toEqual(state.observations);
      expect(matrix.analysisRuns).toEqual(state.analysisRuns);
      expect(JSON.stringify(state)).toBe(before);
      // The real SQLite encoder, not a JSON surrogate, consumes this valid state below.
      writeFileSync(path.join(qa, "matrix-state.json"), JSON.stringify(matrix, null, 2));
      const changes: { path: string[]; value: unknown }[] = [
        { path: ["futureField"], value: true },
        { path: ["rawMatrix", "futureField"], value: true },
        { path: ["spec", "heatmap", "futureField"], value: true },
        { path: ["spec", "appearance", "futureField"], value: true },
        { path: ["rawMatrix", "version"], value: "9.0.0" },
        { path: ["spec", "version"], value: "9.0.0" },
        { path: ["rawMatrix", "values", "0"], value: [1] },
      ];
      for (const change of changes) {
        const unsupported = structuredClone(matrix.matrixViews![0]);
        let parent = unsupported as unknown as Record<string, unknown>;
        for (const key of change.path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
        parent[change.path.at(-1)!] = change.value;
        expect(PersistedMatrixViewSchema.safeParse(unsupported).success).toBe(false);
        expect(
          ProjectStateSchema.safeParse({ ...matrix, matrixViews: [unsupported] }).success,
        ).toBe(false);
      }
    });
  },
);
