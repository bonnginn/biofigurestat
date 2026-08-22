import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../app/evaluationMode", () => ({
  evaluationMode: {
    enabled: true,
    apiBasePath: "/api/evaluation",
    sourceRevision: "fixture-revision",
  },
  evaluationModeIsConfigured: (config: { enabled: boolean; apiBasePath: string | null }) =>
    Boolean(config.enabled && config.apiBasePath?.startsWith("/")),
}));

import { startBenchmarkRun } from "../app/benchmarkEvaluation";
import { createIndependentTwoGroupFixture } from "../app/syntheticFixtures";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

describe("ExperimentWorkspace benchmark pilot loader", () => {
  it("loads values only after a matching researcher design reaches an Exp data tab", () => {
    const fixture = createIndependentTwoGroupFixture();
    startBenchmarkRun({
      benchmarkVersion: "LSA50_v1_1",
      caseId: "pilot_independent_2group",
      track: "track_A",
      runId: "run_001",
    });
    render(
      <ExperimentWorkspace
        initialDraft={{ ...fixture.draft, dataOrigin: "research", name: "Researcher-built design" }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "このPilotの合成値を一括入力" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const load = screen.getByRole("button", { name: "このPilotの合成値を一括入力" });
    expect(load).toBeEnabled();
    fireEvent.click(load);

    expect(screen.getByText("合成値をすべての実験タブへ入力しました。")).toBeVisible();
    expect(screen.getByText("ブラウザレビュー用データ")).toBeVisible();
    expect(screen.getByRole("button", { name: "Controlの生データを開く" })).toHaveTextContent(
      "n=1 / 平均 10",
    );
    expect(screen.getByRole("button", { name: "Treatment Aの生データを開く" })).toHaveTextContent(
      "n=1 / 平均 15",
    );
  });
});
