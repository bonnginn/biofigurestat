import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";

type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

const firstTestName = "pairwise:condition.vehicle:condition.drug";
const analysisResult = {
  status: "ok",
  requestId: "request.1",
  tests: [
    { name: firstTestName, adjustedPValue: 0.01 },
    { name: "pairwise:condition.vehicle:condition.drug-b", adjustedPValue: 0.02 },
  ],
} as AnalysisEngineResult;

const draft = {
  conditions: [
    { id: "condition.vehicle", label: "Vehicle", attributes: {} },
    { id: "condition.drug", label: "Drug", attributes: {} },
    { id: "condition.drug-b", label: "Drug B", attributes: {} },
  ],
  attributes: [{ id: "attribute.treatment", label: "Treatment" }],
} as unknown as ExperimentSetDraft;

const candidates: StatisticsAnnotationEntry[] = [
  {
    id: "annotation.0",
    comparisonId: firstTestName,
    testIndex: 0,
    mode: "exact_p",
    showNonSignificant: true,
    presentation: "bracket",
    endpoints: [{ conditionId: "condition.vehicle" }, { conditionId: "condition.drug" }],
  },
  {
    id: "annotation.1",
    comparisonId: "pairwise:condition.vehicle:condition.drug-b",
    testIndex: 1,
    mode: "exact_p",
    showNonSignificant: true,
    presentation: "bracket",
    endpoints: [{ conditionId: "condition.vehicle" }, { conditionId: "condition.drug-b" }],
  },
];

function Harness({ onAddSelectedComparison = vi.fn() }) {
  const [selection, setSelection] = useState<StatisticsAnnotation>({
    mode: "symbol",
    testIndex: 0,
  });
  const [annotations, setAnnotations] = useState<StatisticsAnnotationEntry[]>([candidates[0]!]);
  return (
    <ExperimentGraphAnnotationEditor
      analysisResult={analysisResult}
      draft={draft}
      baseAnnotationContext="Welch ANOVA"
      annotationContext="Welch ANOVA"
      adjustedComparisonAnnotations={candidates}
      statisticsAnnotation={selection}
      statisticsAnnotations={annotations}
      setStatisticsAnnotation={setSelection}
      setStatisticsAnnotations={setAnnotations}
      onAddSelectedComparison={onAddSelectedComparison}
    />
  );
}

describe("ExperimentGraphAnnotationEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("toggles the complete adjusted family without recalculating", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("すべての比較をまとめて注釈へ追加"));

    expect(screen.getAllByRole("button", { name: "グラフから外す" })).toHaveLength(2);
    expect(screen.getAllByLabelText(/の表示形式$/)).toHaveLength(2);
  });

  it("delegates selected-comparison creation and owns presentation-only edits", () => {
    const onAddSelectedComparison = vi.fn();
    render(<Harness onAddSelectedComparison={onAddSelectedComparison} />);

    fireEvent.click(screen.getByRole("button", { name: "この比較を注釈へ追加" }));
    expect(onAddSelectedComparison).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText(`${firstTestName}の配置形式`), {
      target: { value: "symbol_only" },
    });
    fireEvent.change(screen.getByLabelText(`${firstTestName}の統計凡例`), {
      target: { value: "** vs Vehicle" },
    });
    expect(screen.getByLabelText(`${firstTestName}の統計凡例`)).toHaveValue("** vs Vehicle");

    fireEvent.click(screen.getByRole("button", { name: "グラフから外す" }));
    expect(screen.queryByLabelText(`${firstTestName}の配置形式`)).not.toBeInTheDocument();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness />);

    expect(screen.getByRole("heading", { name: "Annotations on the Graph" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
