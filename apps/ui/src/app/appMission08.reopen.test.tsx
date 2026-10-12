import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { openProjectPackage, ProjectStateSchema } from "@lsaa/project";
import { describe, expect, it, vi } from "vitest";
import { rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import type { AnalysisRunner } from "./analysisClient";
import type { SaveProjectAction } from "./projectActions";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";
import { serializeGraphSvg } from "./graphExport";
const qa = path.resolve(import.meta.dirname, "../../.app-mission08");
describe.skipIf(process.env.BIOFIGURESTAT_APP08_ACCEPTANCE !== "1")(
  "APP08 reopened actual container",
  () => {
    it("checks real container integrity and continues editing without reusing an obsolete result", async () => {
      const python = path.resolve(qa, "../../../engine/python/.venv/Scripts/python.exe");
      const extracted = spawnSync(
        python,
        [
          "-c",
          "import sqlite3,json,base64,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); print(json.dumps({p:base64.b64encode(d).decode() for p,d in c.execute('SELECT path,data FROM container_entries')}))",
          path.join(qa, "anonymous-donor-split.lsa"),
        ],
        { encoding: "utf8" },
      );
      expect(extracted.status, extracted.stderr).toBe(0);
      const entries = JSON.parse(extracted.stdout) as Record<string, string>;
      const storage = {
        readFile: async (_target: string, name: string) =>
          Uint8Array.from(Buffer.from(entries[name]!, "base64")),
        beginAtomicWrite: async () => {
          throw new Error("read-only verification");
        },
      };
      const pack = await openProjectPackage(
        storage,
        path.join(qa, "anonymous-donor-split.lsa"),
        async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      );
      expect(pack.manifest.projectKind).toBe("experiment");
      const state = ProjectStateSchema.parse(
        JSON.parse(readFileSync(path.join(qa, "reopened-state.json"), "utf8")),
      );
      const workspace = rehydrateExperimentWorkspace(state)!;
      expect(workspace.graphs[0]!.analysis!.result.engine.name).toBe("lsaa-python");
      const runner = vi.fn<AnalysisRunner>(async (request) => {
        writeFileSync(path.join(qa, "edited-request.json"), JSON.stringify(request, null, 2));
        const execution = spawnSync(python, ["-m", "lsaa_engine.cli"], {
          input: JSON.stringify(request),
          encoding: "utf8",
        });
        expect(execution.status, execution.stderr).toBe(0);
        return JSON.parse(execution.stdout);
      });
      const save = vi.fn<SaveProjectAction>(async (value) => ({
        state: value,
        target: "candidate-qa-edit.lsa",
      }));
      render(
        <ExperimentWorkspace
          initialDraft={workspace.draft}
          initialCells={workspace.cells}
          initialGraphs={workspace.graphs}
          initialDataViewMode={workspace.dataViewMode}
          initialProject={{ state, target: path.join(qa, "anonymous-donor-split.lsa") }}
          analysisRunner={runner}
          saveProject={save}
          onBack={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(
        "推定値 = -1.5",
      );
      fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
      const svg = document.querySelector<SVGSVGElement>("svg.experiment-graph-svg")!;
      writeFileSync(path.join(qa, "reopened-figure.svg"), serializeGraphSvg(svg));
      fireEvent.click(screen.getByRole("button", { name: "データ" }));
      const numbers = screen.queryAllByRole("spinbutton");
      const texts = screen.queryAllByRole("textbox");
      const valueInput =
        numbers.find(
          (x) => x.getAttribute("type") === "number" && (x as HTMLInputElement).value === "1",
        ) ?? texts.find((x) => (x as HTMLInputElement).value === "1");
      expect(valueInput, "editable canonical value after reopen").toBeDefined();
      fireEvent.change(valueInput!, { target: { value: "11" } });
      fireEvent.blur(valueInput!);
      const undo = screen.getByRole("button", { name: "入力を元に戻す" });
      await waitFor(() => expect(undo).toBeEnabled());
      fireEvent.click(undo);
      await waitFor(() => expect((valueInput as HTMLInputElement).value).toBe("1"));
      fireEvent.click(screen.getByRole("button", { name: "入力をやり直す" }));
      await waitFor(() => expect((valueInput as HTMLInputElement).value).toBe("11"));
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      await waitFor(() =>
        expect(screen.queryByRole("group", { name: "統計解析結果" })).not.toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const edited = save.mock.calls[0]![0];
      expect(edited.analysisRuns).toHaveLength(state.analysisRuns.length);
      expect(edited.activeRawRevisionId).not.toBe(state.activeRawRevisionId);
      expect(edited.experimentWorkspace!.graphs[0]!.analysisRunId).toBeNull();
      expect(edited.analysisRuns[0]!.state).toBe("stale");
      expect(runner).not.toHaveBeenCalled();
      writeFileSync(path.join(qa, "edited-state.json"), JSON.stringify(edited, null, 2));
      const vehicle = screen.getByRole("checkbox", { name: "統計の条件：Vehicle" });
      fireEvent.click(vehicle);
      expect(screen.queryByRole("button", { name: "選択した解析を実行" })).not.toBeInTheDocument();
      fireEvent.click(vehicle);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
      await waitFor(() =>
        expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(
          "推定値 = 3.5",
        ),
      );
      expect(runner).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      const rerun = save.mock.calls[1]![0];
      expect(rerun.analysisRuns).toHaveLength(state.analysisRuns.length + 1);
      expect(rerun.analysisRuns[0]!.result).toEqual(state.analysisRuns[0]!.result);
      expect(rerun.analysisRuns.at(-1)!.state).toBe("current");
      writeFileSync(path.join(qa, "rerun-state.json"), JSON.stringify(rerun, null, 2));
      fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
      writeFileSync(
        path.join(qa, "rerun-figure.svg"),
        serializeGraphSvg(document.querySelector<SVGSVGElement>("svg.experiment-graph-svg")!),
      );
    });
  },
);
