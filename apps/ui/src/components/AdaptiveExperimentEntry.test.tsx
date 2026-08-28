import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveExperimentEntry } from "./AdaptiveExperimentEntry";
import { buildStructureContract } from "@lsaa/adaptive-input";

function answerJapaneseQuestions() {
  fireEvent.change(screen.getByLabelText("実験名"), { target: { value: "Matched cells" } });
  fireEvent.change(screen.getByLabelText("実際に何をしたか"), {
    target: { value: "同じ6細胞を暗条件と照明条件で測定した。" },
  });
  fireEvent.change(screen.getByLabelText("独立な生物学的単位"), { target: { value: "cell" } });
  fireEvent.change(screen.getByLabelText("単位を識別する列"), { target: { value: "CellID" } });
  fireEvent.change(screen.getByLabelText("測定項目"), { target: { value: "Intensity" } });
  fireEvent.change(screen.getByLabelText("条件・要因名（任意）"), {
    target: { value: "Illumination" },
  });
  fireEvent.change(screen.getByLabelText("水準（カンマ区切り）"), {
    target: { value: "Dark, Lit" },
  });
  fireEvent.click(screen.getByLabelText("同じidentityを条件間で測定した"));
}

describe("AdaptiveExperimentEntry accessibility and localization", () => {
  it("is keyboard-focusable, selects a surface deterministically, and exposes semantic table headers", async () => {
    const onReady = vi.fn();
    render(
      <AdaptiveExperimentEntry
        locale="ja"
        onCancel={vi.fn()}
        onReady={onReady}
        onSurvivalReady={vi.fn()}
      />,
    );
    answerJapaneseQuestions();
    const generate = screen.getByRole("button", { name: "入力面を作る" });
    generate.focus();
    expect(generate).toHaveFocus();
    fireEvent.click(generate);
    expect(screen.getByRole("heading", { name: "compact_unit_matrix" })).toBeVisible();
    const paste = screen.getByLabelText("表を貼り付ける");
    fireEvent.change(paste, { target: { value: "CellID\tDark\tLit\nC1\t1\t2\nC2\t3\t4" } });
    fireEvent.click(screen.getByRole("button", { name: "この入力面を使う" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const table = screen.getByRole("table", { name: "正規化後の入力preview" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("rowheader")).toHaveLength(4);
    expect(table.parentElement).toHaveAttribute("tabindex", "0");
  });

  it("uses English labels without changing persisted semantic keys", () => {
    render(
      <AdaptiveExperimentEntry
        locale="en"
        onCancel={vi.fn()}
        onReady={vi.fn()}
        onSurvivalReady={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Start from experiment structure" })).toBeVisible();
    expect(screen.getByLabelText("Independent biological unit")).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate input surface" })).toBeDisabled();
    expect(screen.getByText(/Complete: Experiment name/)).toBeVisible();
  });

  it("keeps pasted data while the researcher corrects the experiment structure", () => {
    render(
      <AdaptiveExperimentEntry
        locale="ja"
        onCancel={vi.fn()}
        onReady={vi.fn()}
        onSurvivalReady={vi.fn()}
      />,
    );
    answerJapaneseQuestions();
    fireEvent.click(screen.getByRole("button", { name: "入力面を作る" }));
    const pasted = "CellID\tDark\tLit\nC1\t1\t2\nC2\t3\t4";
    fireEvent.change(screen.getByLabelText("表を貼り付ける"), { target: { value: pasted } });

    fireEvent.click(screen.getByRole("button", { name: "実験構造を修正" }));
    fireEvent.change(screen.getByLabelText("水準（カンマ区切り）"), {
      target: { value: "Dark, Light" },
    });
    fireEvent.click(screen.getByRole("button", { name: "入力面を作る" }));

    expect(screen.getByLabelText("表を貼り付ける")).toHaveValue(pasted);
  });

  it("accepts a generic TSV file through the same canonical adapter", async () => {
    const onReady = vi.fn();
    const { container } = render(
      <AdaptiveExperimentEntry
        locale="ja"
        onCancel={vi.fn()}
        onReady={onReady}
        onSurvivalReady={vi.fn()}
      />,
    );
    answerJapaneseQuestions();
    fireEvent.click(screen.getByRole("button", { name: "入力面を作る" }));
    const file = new File(["CellID\tDark\tLit\nC1\t1\t2"], "matched.tsv", {
      type: "text/tab-separated-values",
    });
    Object.defineProperty(file, "text", { value: async () => "CellID\tDark\tLit\nC1\t1\t2" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0]?.[0].adaptiveInput?.rawLineage?.sourceKind).toBe("tsv");
    expect(onReady.mock.calls[0]?.[0].adaptiveInput?.rawLineage?.sourceLabel).toBe("matched.tsv");
  });

  it("keeps semantic enums language-independent and generates collision-free Japanese keys", () => {
    const common = {
      experimentDescription: "description",
      readoutRepresentation: "scalar" as const,
      sameIdentityAcrossConditions: true,
    };
    const ja = buildStructureContract({
      ...common,
      experimentName: "照明実験",
      experimentalUnitLabel: "細胞",
      identityLabel: "細胞ID",
      readoutLabel: "蛍光強度",
      factorName: "照明",
      factorLevels: ["暗所", "明所"],
    });
    const en = buildStructureContract({
      ...common,
      experimentName: "Light experiment",
      experimentalUnitLabel: "cell",
      identityLabel: "CellID",
      readoutLabel: "Intensity",
      factorName: "Light",
      factorLevels: ["Dark", "Lit"],
    });
    expect(ja.matching.kind).toBe(en.matching.kind);
    expect(ja.factors[0]?.relationship).toBe(en.factors[0]?.relationship);
    expect(
      new Set([ja.experimentalUnitLevelKey, ja.identities[0]!.key, ja.readouts[0]!.key]).size,
    ).toBe(3);
    expect(Object.values(ja).join("|")).not.toContain("undefined");
  });

  it("adds generic factor rows and preserves a 2x2 factorial structure", async () => {
    const onReady = vi.fn();
    render(
      <AdaptiveExperimentEntry
        locale="ja"
        onCancel={vi.fn()}
        onReady={onReady}
        onSurvivalReady={vi.fn()}
      />,
    );
    answerJapaneseQuestions();
    fireEvent.click(screen.getByLabelText("同じidentityを条件間で測定した"));
    fireEvent.click(screen.getByRole("button", { name: "＋ 要因を追加" }));
    fireEvent.change(screen.getByLabelText("条件・要因名 2"), { target: { value: "Construct" } });
    fireEvent.change(screen.getByLabelText("水準 2"), { target: { value: "Empty, Rescue" } });
    fireEvent.click(screen.getByRole("button", { name: "入力面を作る" }));
    expect(screen.getByRole("heading", { name: "factor_observation_table" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("表を貼り付ける"), {
      target: {
        value:
          "CellID\tIllumination\tConstruct\tIntensity\nR1\tDark\tEmpty\t1\nR2\tDark\tRescue\t2\nR3\tLit\tEmpty\t3\nR4\tLit\tRescue\t4",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "この入力面を使う" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0]?.[0].adaptiveInput?.contract.factors).toHaveLength(2);
    expect(onReady.mock.calls[0]?.[0].conditions).toHaveLength(4);
  });

  it("persists only a missingness confirmation the researcher actually checked", async () => {
    const onReady = vi.fn();
    render(
      <AdaptiveExperimentEntry
        locale="ja"
        onCancel={vi.fn()}
        onReady={onReady}
        onSurvivalReady={vi.fn()}
      />,
    );
    answerJapaneseQuestions();
    fireEvent.click(screen.getByRole("button", { name: "入力面を作る" }));
    fireEvent.change(screen.getByLabelText("表を貼り付ける"), {
      target: { value: "CellID\tDark\tLit\nC1\t1\t\nC2\t3\t4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "この入力面を使う" }));
    expect(onReady).not.toHaveBeenCalled();
    const confirmation = await screen.findByLabelText("欠損理由を確認しました");
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "この入力面を使う" }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0]?.[0].adaptiveInput?.targetedConfirmations).toEqual([
      expect.objectContaining({ key: "classify_missingness_reason", answer: "confirmed" }),
    ]);
  });
});
