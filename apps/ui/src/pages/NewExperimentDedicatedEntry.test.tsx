import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ADAPTIVE_INPUT_FEATURE_FLAG } from "../app/adaptiveInputFeature";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import { NewExperimentPage } from "./NewExperimentPage";

function chooseDedicatedEntry(
  context: "cell_culture" | "protein_biochemical" | "animal" | "general_assay",
  routeName: RegExp,
  adaptiveEnabled = true,
): {
  onDedicatedEntryReady: ReturnType<typeof vi.fn<(intent: DedicatedEntryIntent) => void>>;
  onNavigate: ReturnType<typeof vi.fn>;
} {
  if (adaptiveEnabled) window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
  else window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
  const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
  const onNavigate = vi.fn();
  render(
    <NewExperimentPage
      onNavigate={onNavigate}
      onDedicatedEntryReady={onDedicatedEntryReady}
      showCompatibilityEntry={adaptiveEnabled}
    />,
  );
  if (adaptiveEnabled) {
    fireEvent.click(screen.getByRole("button", { name: "以前の入口を使う" }));
  }
  fireEvent.click(document.querySelector(`[data-context="${context}"]`)!);
  fireEvent.click(screen.getByRole("button", { name: routeName }));
  return { onDedicatedEntryReady, onNavigate };
}

describe("New Experiment dedicated entry handoff", () => {
  afterEach(() => window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG));

  it("keeps the legacy destination available when the adaptive feature flag is off", () => {
    const { onDedicatedEntryReady, onNavigate } = chooseDedicatedEntry(
      "animal",
      /humane endpoint・eventまでの期間/,
      false,
    );

    expect(onDedicatedEntryReady).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith("survival");
  });

  it("hands the direct Survival task to a semantic intent without a legacy fallback", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage
        onNavigate={onNavigate}
        onDedicatedEntryReady={onDedicatedEntryReady}
        saveUnresolvedVisualizationProject={vi.fn(async () => null)}
        openUnresolvedVisualizationProject={vi.fn(async () => null)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生存時間（Kaplan–Meier）を開く" }));

    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "time_to_event",
        destination: "survival",
        sourceContext: "general_assay",
        entryRouteId: "direct_time_to_event",
        facts: {
          timeToEventPattern: "single_terminal_event_or_censoring",
          subjectUnitRelationship: "unknown",
        },
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    {
      button: "酵素反応・飽和カーブを開く",
      moduleId: "ordered_curve_kinetics",
      destination: "nonlinear-fit",
      entryRouteId: "direct_ordered_curve",
      facts: { orderedAxisCount: 1 },
    },
    {
      button: "ヒートマップを開く",
      moduleId: "matrix_visualization",
      destination: "heatmap",
      entryRouteId: "direct_heatmap",
      facts: {},
    },
  ] as const)("hands $button over in one click without inventing structure facts", (example) => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage
        onNavigate={onNavigate}
        onDedicatedEntryReady={onDedicatedEntryReady}
        saveUnresolvedVisualizationProject={vi.fn(async () => null)}
        openUnresolvedVisualizationProject={vi.fn(async () => null)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: example.button }));

    expect(onDedicatedEntryReady).toHaveBeenCalledOnce();
    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: example.moduleId,
        destination: example.destination,
        entryRouteId: example.entryRouteId,
        facts: example.facts,
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps Graph-only input and descriptive Graph available without persistence handlers", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage browserPreview onNavigate={onNavigate} onDedicatedEntryReady={vi.fn()} />,
    );

    const graphOnly = screen.getByRole("button", { name: "手元の表からGraphを作るを開く" });
    expect(graphOnly).toBeEnabled();
    fireEvent.click(graphOnly);
    expect(screen.getByRole("heading", { name: "手元の表からGraphを作る" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "保存したGraph用データを開く" })).toBeNull();
    const saveButton = screen.getByRole("button", { name: "このGraph用データを保存" });
    expect(saveButton).toBeDisabled();
    const unavailableNote = screen.getByText(
      "このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。",
    );
    expect(saveButton).toHaveAttribute("aria-describedby", unavailableNote.id);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "入口へ戻る" }));
    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toHaveFocus();
  });

  it("keeps a Graph-only table while adding the biological facts needed for Statistics", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(
      <NewExperimentPage browserPreview onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: "Condition\tValue\nControl\t10\nDrug\t14" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "no_id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));

    expect(screen.getByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Graph用の元表は保持");
    expect(screen.getByText("Condition: Control、Drug。測定: Value")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "処理・群分け 1の名前" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "条件・測定を修正" }));
    expect(screen.getByRole("textbox", { name: "処理・群分け 1の名前" })).toHaveValue("Condition");
    expect(screen.getByRole("textbox", { name: "行 1 列 1" })).toHaveValue("Control");
    expect(screen.getByRole("textbox", { name: "行 1 列 2" })).toHaveValue("Drug");
    expect(screen.getByPlaceholderText("例：細胞生存率")).toHaveValue("Value");

    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByText("実験ワークスペース")).toBeVisible();
    expect(screen.getByRole("button", { name: "グラフ (1)" })).toBeEnabled();
    const importedValues = screen.getByRole("table", { name: "条件ごとにまとめて表示" });
    expect(within(importedValues).getByText("10")).toBeVisible();
    expect(within(importedValues).getByText("14")).toBeVisible();
  });

  it("guards Heatmap when its dedicated-entry handoff is unavailable", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage browserPreview onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "生存時間（Kaplan–Meier）を開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "酵素反応・飽和カーブを開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ヒートマップを開く" })).toBeDisabled();
    expect(screen.getByText("行列を保った専用入力への接続を利用できません。")).toBeVisible();
  });

  it("opens the biological general setup from the feature-flagged hub without internal labels", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);

    const generalEntry = screen.getByRole("button", { name: "実験から始めるを開く" });
    fireEvent.click(generalEntry);

    expect(screen.getByRole("heading", { name: "実験の条件と測定内容" })).toHaveFocus();
    expect(screen.getByText("処理・群分け")).toBeVisible();
    expect(screen.queryByText(/StructureContract|identity column|factor|ordered axis/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(screen.getByRole("button", { name: "実験から始めるを開く" })).toHaveFocus();
  });

  it("hands a ready common biological plan to the existing experiment workspace", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));

    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "薬剤" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "0 nM" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 2" }), {
      target: { value: "10 nM" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), {
      target: { value: "細胞生存率" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "dish" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByRole("heading", { name: "細胞生存率の実験" })).toHaveFocus();
    expect(screen.getByText("実験ワークスペース")).toBeVisible();
  });

  it("keeps the established context-first screen unchanged when the feature flag is off", () => {
    window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "実験から始める" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "実験の条件と測定内容" })).toBeNull();
  });

  it("hands animal survival to time-to-event without guessing the assignment unit", () => {
    const { onDedicatedEntryReady, onNavigate } = chooseDedicatedEntry(
      "animal",
      /humane endpoint・eventまでの期間/,
    );

    expect(onDedicatedEntryReady).toHaveBeenCalledTimes(1);
    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "time_to_event",
        destination: "survival",
        sourceContext: "animal",
        entryRouteId: "animal_time_to_event",
        facts: {
          timeToEventPattern: "single_terminal_event_or_censoring",
          subjectUnitRelationship: "unknown",
        },
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ["cell_culture", /Cellの最初のevent発生までの時間/, "cell_time_to_event"],
    ["general_assay", /^最初のevent発生までの時間/, "general_time_to_event"],
  ] as const)(
    "keeps the subject unit unresolved for %s time-to-event entry",
    (context, routeName, entryRouteId) => {
      const { onDedicatedEntryReady } = chooseDedicatedEntry(context, routeName);

      expect(onDedicatedEntryReady).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: "time_to_event",
          destination: "survival",
          entryRouteId,
          facts: {
            timeToEventPattern: "single_terminal_event_or_censoring",
            subjectUnitRelationship: "unknown",
          },
        }),
      );
    },
  );

  it.each([
    ["protein_biochemical", /時間・濃度に対する反応曲線/, "protein_kinetic_fit"],
    ["general_assay", /Xに対する非線形な応答/, "general_nonlinear_fit"],
  ] as const)(
    "hands %s ordered curves over without guessing axis or material continuity",
    (context, routeName, entryRouteId) => {
      const { onDedicatedEntryReady } = chooseDedicatedEntry(context, routeName);
      const intent = onDedicatedEntryReady.mock.calls[0]?.[0];

      expect(intent).toMatchObject({
        moduleId: "ordered_curve_kinetics",
        destination: "nonlinear-fit",
        entryRouteId,
        facts: { orderedAxisCount: 1 },
      });
      expect(intent?.facts.orderedAxisMeaning).toBeUndefined();
      expect(intent?.facts.axisMaterialRelationship).toBeUndefined();
      expect(Object.keys(intent?.facts ?? {})).toEqual(["orderedAxisCount"]);
    },
  );
});
