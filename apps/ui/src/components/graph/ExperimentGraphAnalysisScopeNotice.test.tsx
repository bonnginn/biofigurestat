import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { createLongitudinalFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import {
  ExperimentGraphAnalysisScopeNotice,
  selectGraphAnalysisScopePresentation,
} from "./ExperimentGraphAnalysisScopeNotice";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

describe("ExperimentGraphAnalysisScopeNotice", () => {
  it("defines one presentation decision for the notice and Statistics panel", () => {
    expect(
      selectGraphAnalysisScopePresentation({
        timePointCount: 3,
        plan: { kind: "selected_timepoint" },
        analysisTimePointId: null,
        hasFactorByTimeStructure: false,
      }),
    ).toEqual({ showNotice: true, blockStatistics: true });
    expect(
      selectGraphAnalysisScopePresentation({
        timePointCount: 3,
        plan: { kind: "selected_timepoint" },
        analysisTimePointId: "time.24",
        hasFactorByTimeStructure: true,
      }),
    ).toEqual({ showNotice: true, blockStatistics: false });
    expect(
      selectGraphAnalysisScopePresentation({
        timePointCount: 3,
        plan: { kind: "selected_timepoint" },
        analysisTimePointId: "time.24",
        hasFactorByTimeStructure: false,
      }),
    ).toEqual({ showNotice: false, blockStatistics: false });
  });

  it("does not imply a full factor-by-time model when one time point is selected", () => {
    const { draft } = createLongitudinalFixture();
    render(
      <ExperimentGraphAnalysisScopeNotice
        time={draft.time}
        plan={{ kind: "selected_timepoint" }}
        analysisTimePointId={draft.time.points[0]!.id}
        hasFactorByTimeStructure
        varyingFactorLabels={["Treatment", "Genotype"]}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent("因子×時間の全体モデルではありません");
    expect(screen.getByRole("note")).toHaveTextContent("Treatment、Genotype");
  });

  it("explains the safe stop in English without Japanese application copy", () => {
    act(() => setAppLocale("en"));
    const { draft } = createLongitudinalFixture();
    const view = render(
      <ExperimentGraphAnalysisScopeNotice
        time={draft.time}
        plan={{ kind: "selected_timepoint" }}
        analysisTimePointId={null}
        hasFactorByTimeStructure
        varyingFactorLabels={["Treatment", "Genotype"]}
      />,
    );

    expect(screen.getByRole("heading", { name: /multiple treatments and time/ })).toBeVisible();
    expect(screen.getByText(/does not test the factor × time interaction/)).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
