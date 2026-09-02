import {
  lazy,
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type {
  ConditionAttributeDraft,
  ConditionDraft,
  ExperimentContext,
  ExperimentSetDraft,
  ExperimentSessionDraft,
  ExperimentCellMap,
  ReadoutShape,
  TimeSampling,
  TimeUnit,
} from "../app/experimentDraft";
import {
  activeConditions,
  conditionDisplayLabel,
  createExperimentSession,
  createExperimentSetDraft,
  EXPERIMENT_CONTEXT_OPTIONS,
  expectedAnalysisLabel,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  withActiveConditions,
} from "../app/experimentDraft";
import { specializedAnalysisRoutes, type AppRoute } from "../app/routes";
import type {
  OpenUnresolvedVisualizationProjectAction,
  SaveProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import { ConditionTimePreview } from "../components/ConditionTimePreview";
import { ExistingDataImport } from "../components/ExistingDataImport";
import type { ExperimentWorkspaceProps } from "./ExperimentWorkspace";
import { recordBenchmarkEvent } from "../app/benchmarkEvaluation";
import { evaluationMode, evaluationModeIsConfigured } from "../app/evaluationMode";
import { syntheticFixtures, type SyntheticFixture } from "../app/syntheticFixtures";
import "./NewExperimentPage.css";
import type { FavoriteGraphDefault } from "../app/favoriteDesigns";
import type { AdaptiveInputSnapshot } from "@lsaa/domain";
import {
  createUnresolvedVisualizationPromotionHistory,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { AdaptiveExperimentEntry } from "../components/AdaptiveExperimentEntry";
import { BiologicalExperimentSetup } from "../components/BiologicalExperimentSetup";
import { SimpleGroupExperimentEntry } from "../components/SimpleGroupExperimentEntry";
import {
  NewExperimentEntryHub,
  type NewExperimentEntryId,
} from "../components/NewExperimentEntryHub";
import { createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import { createBiologicalSetupPresentation } from "../app/adaptiveStructureRevision";
import { adaptiveInputFeatureEnabled } from "../app/adaptiveInputFeature";
import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";
import { bridgeGraphOnlyTableToStatistics } from "../app/graphOnlyStatisticsBridge";
import { rebindGraphOnlyGraphsToWorkspace } from "../app/graphOnlyWorkspaceGraph";
import type { WorkspaceGraphState } from "../app/experimentWorkspaceProject";
import {
  createDedicatedEntryIntent,
  type DedicatedEntryIntent,
  type DedicatedEntryModuleId,
} from "../app/dedicatedEntryIntent";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import { recordUsageEntry, recordUsageMilestone } from "../app/usageTelemetry";
import {
  biologicalHandoffStopMessage,
  biologicalWorkspaceStopMessage,
} from "../app/newExperimentMessages";

const ExperimentWorkspace = lazy(() =>
  import("./ExperimentWorkspace").then(({ ExperimentWorkspace: Workspace }) => ({
    default: Workspace,
  })),
);

const GraphOnlyVisualizationPage = lazy(() =>
  import("./GraphOnlyVisualizationPage").then(({ GraphOnlyVisualizationPage: Page }) => ({
    default: Page,
  })),
);

type NewExperimentPageProps = {
  onNavigate: (route: AppRoute) => void;
  saveProject?: SaveProjectAction;
  saveUnresolvedVisualizationProject?: SaveUnresolvedVisualizationProjectAction;
  openUnresolvedVisualizationProject?: OpenUnresolvedVisualizationProjectAction;
  initialGraphOnlyState?: UnresolvedVisualizationProjectState | null;
  initialGraphOnlyTarget?: string;
  analysisRunner?: AnalysisRunner;
  browserPreview?: boolean;
  analysisAvailable?: boolean;
  initialDraft?: ExperimentSetDraft | null;
  initialFixture?: SyntheticFixture | null;
  favoriteGraphDefaults?: readonly FavoriteGraphDefault[];
  onSaveFavorite?: ExperimentWorkspaceProps["onSaveFavorite"];
  onDirtyChange?: (dirty: boolean) => void;
  onOpenProject?: () => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
  onAdaptiveSurvivalReady?: (text: string, snapshot: AdaptiveInputSnapshot) => void;
  onDedicatedEntryReady?: (intent: DedicatedEntryIntent) => void;
  /** Native paired save/reopen capability for editable specialized-entry drafts. */
  specializedEntryAvailable?: boolean;
  /** Test/debug access only. Production rollback is controlled by the feature flag. */
  showCompatibilityEntry?: boolean;
};

type FlowStage =
  | "context"
  | "simple"
  | "import"
  | "graph-only"
  | "biological"
  | "adaptive"
  | "design"
  | "confirmation"
  | "workspace";
type DesignStep = 0 | 1 | 2 | 3;
type FlowStep = DesignStep | 4;
type ExplicitStructureAnswers = Readonly<{
  conditionAssignment: boolean;
  orderedAxis: boolean;
  axisSemantic: boolean;
  axisSampling: boolean;
  sharedSourceSplit: boolean;
}>;

function graphOnlyBiologicalInitial(
  state: UnresolvedVisualizationProjectState,
  locale: AppLocale,
) {
  const xColumn = state.mapping?.columns.find(({ role }) => role === "x");
  const yColumn = state.mapping?.columns.find(({ role }) => role === "y");
  if (!xColumn || !yColumn) return undefined;
  const levels = [
    ...new Set(state.table.rows.map((row) => row[xColumn.index]?.trim() ?? "").filter(Boolean)),
  ];
  return {
    title: state.metadata.projectName,
    measurementLabel: yColumn.header,
    conditionBlocks: [{ name: xColumn.header, levels }],
    statisticsHandoff: true,
    notice: localizedText(
      locale,
      "Graph用の元表は保持しています。横軸の値と測定項目を候補として入れました。実際の対象・試料と条件間の関係だけ追加してください。",
      "The source table for the Graph is retained. X-axis values and the measured readout are prefilled; add only the actual subject or specimen and its relationship across conditions.",
    ),
  } as const;
}

const UNANSWERED_STRUCTURE: ExplicitStructureAnswers = {
  conditionAssignment: false,
  orderedAxis: false,
  axisSemantic: false,
  axisSampling: false,
  sharedSourceSplit: false,
};

const CONFIRMED_STRUCTURE: ExplicitStructureAnswers = {
  conditionAssignment: true,
  orderedAxis: true,
  axisSemantic: true,
  axisSampling: true,
  sharedSourceSplit: false,
};

const READOUT_OPTIONS: ReadonlyArray<{
  shape: ReadoutShape;
  title: string;
  description: string;
}> = [
  {
    shape: "proportion",
    title: "数・割合（陽性率など）",
    description: "陽性数と全体の数を入力し、割合を確認します。",
  },
  {
    shape: "nested_continuous",
    title: "数値（細胞数・強度・サイズなど）",
    description: "各試料やCell・ROIについて記録した数値を入力します。",
  },
  {
    shape: "categorical_counts",
    title: "カテゴリ別の数・構成",
    description: "G0/G1/S/G2-Mや表現型A/B/Cなどの数を入力し、構成割合を計算します。",
  },
  {
    shape: "wb_ratio",
    title: "WB：標的バンド／reference",
    description: "標的とローディングコントロールの生値を保存し、比を自動計算します。",
  },
];

const TIME_UNITS: ReadonlyArray<{ value: TimeUnit; label: string }> = [
  { value: "sec", label: "秒" },
  { value: "min", label: "分" },
  { value: "h", label: "時間" },
  { value: "day", label: "日" },
];

const STEP_LABELS = ["測定項目", "条件", "測定軸", "実験回", "最終確認"] as const;

export function flowStepsFor(draft: ExperimentSetDraft): readonly FlowStep[] {
  if (draft.entryRoute === "protein_wb" || draft.analysisIntent.kind === "correlation") {
    return [0, 1, 3, 4];
  }
  return [0, 1, 2, 3, 4];
}

const CONTEXT_LABELS: Record<ExperimentContext, string> = Object.fromEntries(
  EXPERIMENT_CONTEXT_OPTIONS.map((option) => [option.id, option.title]),
) as Record<ExperimentContext, string>;

type ExperimentEntryRoute = Readonly<{
  id: string;
  title: string;
  description: string;
  shape: ReadoutShape;
  defaultReadout?: Readonly<{
    label: string;
    unit: string;
  }>;
  correlation?: boolean;
  longitudinal?: boolean;
  singleCohort?: boolean;
  destination?: AppRoute;
  entryModuleId?: DedicatedEntryModuleId;
}>;

function inferredStructureAnswersForRoute(route: ExperimentEntryRoute): ExplicitStructureAnswers {
  const correlation = Boolean(route.correlation);
  const longitudinal = Boolean(route.longitudinal);
  return {
    conditionAssignment: correlation || Boolean(route.singleCohort),
    orderedAxis: correlation || longitudinal,
    axisSemantic: longitudinal,
    axisSampling: longitudinal,
    sharedSourceSplit: false,
  };
}

function structureAnswersAreComplete(
  draft: ExperimentSetDraft,
  answers: ExplicitStructureAnswers,
): boolean {
  if (!answers.conditionAssignment || answers.sharedSourceSplit) return false;
  if (draft.entryRoute === "protein_wb") return true;
  if (!answers.orderedAxis) return false;
  if (draft.time.sampling === "none") return true;
  return answers.axisSemantic && answers.axisSampling;
}

export const ENTRY_ROUTES: Readonly<
  Record<Exclude<ExperimentContext, "existing_data">, readonly ExperimentEntryRoute[]>
> = {
  cell_culture: [
    {
      id: "cell_count_growth",
      title: "細胞数・増殖",
      description: "cell number、増殖、growth assay",
      shape: "nested_continuous",
      defaultReadout: { label: "細胞数・増殖", unit: "" },
    },
    {
      id: "cell_positive_proportion",
      title: "陽性数・割合",
      description: "Marker陽性、EdU、Ki-67、繊毛陽性など",
      shape: "proportion",
    },
    {
      id: "cell_other_assay",
      title: "その他の培養アッセイ",
      description: "培養単位から得たその他の数値",
      shape: "nested_continuous",
      defaultReadout: { label: "培養アッセイ測定値", unit: "" },
    },
    {
      id: "cell_time_to_event",
      title: "Cellの最初のevent発生までの時間",
      description: "最初の死滅・分裂・発症までを追跡し、観察終了時の打ち切りも記録",
      shape: "nested_continuous",
      destination: "survival",
      entryModuleId: "time_to_event",
    },
  ],
  microscopy_imaging: [
    {
      id: "microscopy_fluorescence",
      title: "蛍光強度",
      description: "実験単位の要約、またはCell・ROIの値",
      shape: "nested_continuous",
      defaultReadout: { label: "蛍光強度", unit: "a.u." },
    },
    {
      id: "microscopy_cell_roi",
      title: "Cell・ROIごとの測定",
      description: "強度、長さ、距離などの数値",
      shape: "nested_continuous",
      defaultReadout: { label: "Cell・ROI測定値", unit: "" },
    },
    {
      id: "microscopy_morphology",
      title: "形態・サイズ",
      description: "面積、長さ、形状指標など",
      shape: "nested_continuous",
      defaultReadout: { label: "形態・サイズ", unit: "" },
    },
    {
      id: "microscopy_tracking",
      title: "移動・tracking",
      description: "速度、移動距離、軌跡、time-lapse",
      shape: "nested_continuous",
      defaultReadout: { label: "移動・tracking", unit: "" },
      longitudinal: true,
    },
    {
      id: "microscopy_proportion",
      title: "陽性数・割合",
      description: "画像から数えた陽性数と対象数",
      shape: "proportion",
    },
  ],
  protein_biochemical: [
    {
      id: "protein_wb",
      title: "Western blot",
      description: "Targetのみ、Target + reference、補正済み値",
      shape: "wb_ratio",
    },
    {
      id: "protein_amount",
      title: "タンパク質量・濃度",
      description: "定量値を条件間で比較",
      shape: "nested_continuous",
      defaultReadout: { label: "タンパク質量・濃度", unit: "" },
    },
    {
      id: "protein_activity",
      title: "活性",
      description: "酵素活性などの数値",
      shape: "nested_continuous",
      defaultReadout: { label: "活性", unit: "" },
    },
    {
      id: "protein_kinetic_fit",
      title: "時間・濃度に対する反応曲線",
      description:
        "時間に対する飽和過程、または基質濃度と計算済み初速度からVmax・Kmを求める非線形fit",
      shape: "nested_continuous",
      destination: "nonlinear-fit",
      entryModuleId: "ordered_curve_kinetics",
    },
    {
      id: "protein_other",
      title: "その他の数値測定",
      description: "生化学アッセイの数値",
      shape: "nested_continuous",
      defaultReadout: { label: "生化学アッセイ測定値", unit: "" },
    },
    {
      id: "protein_xy",
      title: "2つの測定値の関係",
      description: "同じ試料のXとYを1組として入力",
      shape: "nested_continuous",
      correlation: true,
    },
  ],
  animal: [
    {
      id: "animal_numeric",
      title: "個体の数値測定",
      description: "体重、腫瘍体積、血糖、行動スコアなど",
      shape: "nested_continuous",
      defaultReadout: { label: "個体の数値測定", unit: "" },
    },
    {
      id: "animal_longitudinal",
      title: "経時測定",
      description: "同じ個体を複数時点で追跡",
      shape: "nested_continuous",
      defaultReadout: { label: "個体の経時測定", unit: "" },
      longitudinal: true,
    },
    {
      id: "animal_time_to_event",
      title: "humane endpoint・eventまでの期間",
      description: "個体を追跡し、eventと観察終了時の打ち切りを記録",
      shape: "nested_continuous",
      destination: "survival",
      entryModuleId: "time_to_event",
    },
    {
      id: "animal_proportion",
      title: "数・割合",
      description: "個体を単位としたcount・proportion",
      shape: "proportion",
    },
    {
      id: "animal_category",
      title: "カテゴリ・分類",
      description: "複数カテゴリのcountと構成",
      shape: "categorical_counts",
    },
    {
      id: "animal_xy",
      title: "2つの測定値の関係",
      description: "同じ個体のXとYを1組として入力",
      shape: "nested_continuous",
      correlation: true,
    },
  ],
  general_assay: [
    {
      id: "general_single_cohort",
      title: "単一コホート・1群",
      description: "1群の分布表示、記述統計、明示した基準値との比較",
      shape: "nested_continuous",
      defaultReadout: { label: "測定値", unit: "" },
      singleCohort: true,
    },
    {
      id: "general_continuous",
      title: "連続値",
      description: "条件ごとの数値を入力",
      shape: "nested_continuous",
      defaultReadout: { label: "測定値", unit: "" },
    },
    {
      id: "general_time_to_event",
      title: "最初のevent発生までの時間",
      description: "対象を追跡し、最初のeventまたは打ち切りまでの時間を入力",
      shape: "nested_continuous",
      destination: "survival",
      entryModuleId: "time_to_event",
    },
    {
      id: "general_nonlinear_fit",
      title: "Xに対する非線形な応答",
      description: "観測したX/Yと、明示した飽和またはMichaelis–Menten modelによるfit",
      shape: "nested_continuous",
      destination: "nonlinear-fit",
      entryModuleId: "ordered_curve_kinetics",
    },
    {
      id: "general_proportion",
      title: "数・割合",
      description: "positive / totalなど",
      shape: "proportion",
    },
    {
      id: "general_category",
      title: "カテゴリ・構成",
      description: "カテゴリ別countと構成割合",
      shape: "categorical_counts",
    },
    {
      id: "general_xy",
      title: "2つの測定値の関係",
      description: "同じ単位のXとYを1組として入力",
      shape: "nested_continuous",
      correlation: true,
    },
  ],
};

export function createDraftForEntryRoute(
  context: Exclude<ExperimentContext, "existing_data">,
  route: ExperimentEntryRoute,
): ExperimentSetDraft {
  const baseDraft = createExperimentSetDraft(context, route.shape);
  const routedDraft: ExperimentSetDraft = route.correlation
    ? {
        ...baseDraft,
        readouts: [{ id: "readout.xy", label: "XとYの関係", shape: "nested_continuous" }],
        attributes: [{ id: "attribute.variable", label: "測定変数" }],
        conditions: [
          { id: "condition.xy.x", label: "X", attributes: { "attribute.variable": "X" } },
          { id: "condition.xy.y", label: "Y", attributes: { "attribute.variable": "Y" } },
        ],
        analysisIntent: { kind: "correlation", relationshipForm: "linear" },
        conditionAssignment: { kind: "matched", unitLabel: "実験単位" },
      }
    : route.singleCohort
      ? {
          ...baseDraft,
          conditions: [
            {
              id: "condition.cohort",
              label: "Cohort",
              attributes: { "attribute.1": "Cohort" },
            },
          ],
          analysisIntent: { kind: "single_cohort", mode: "descriptive" },
          conditionAssignment: { kind: "independent", unitLabel: "試料" },
        }
      : baseDraft;
  return {
    ...routedDraft,
    readouts: routedDraft.readouts.map((readout, index) => ({
      ...readout,
      ...(index === 0 && route.defaultReadout ? route.defaultReadout : {}),
      ...(readout.shape === "nested_continuous"
        ? {
            nestedInputMode:
              context === "microscopy_imaging"
                ? ("nested_observations" as const)
                : ("unit_summary" as const),
          }
        : {}),
    })),
    entryRoute: route.id,
    ...(route.longitudinal
      ? { time: { ...routedDraft.time, sampling: "longitudinal" as const } }
      : {}),
    conditionAssignment: {
      ...routedDraft.conditionAssignment,
      unitLabel:
        context === "animal"
          ? "動物"
          : context === "general_assay"
            ? "試料"
            : context === "protein_biochemical"
              ? "サンプル"
              : routedDraft.conditionAssignment.unitLabel,
    },
  };
}

function updateAttributeLabel(
  attributes: readonly ConditionAttributeDraft[],
  attributeId: string,
  label: string,
): ConditionAttributeDraft[] {
  return attributes.map((attribute) =>
    attribute.id === attributeId ? { ...attribute, label } : attribute,
  );
}

function removeAttributeValues(
  conditions: readonly ConditionDraft[],
  attributeId: string,
  attributes: readonly ConditionAttributeDraft[],
): ConditionDraft[] {
  return conditions.map((condition) => ({
    ...condition,
    attributes: Object.fromEntries(
      Object.entries(condition.attributes).filter(([key]) => key !== attributeId),
    ),
    label: conditionDisplayLabel(
      {
        ...condition,
        attributes: Object.fromEntries(
          Object.entries(condition.attributes).filter(([key]) => key !== attributeId),
        ),
      },
      attributes.filter((attribute) => attribute.id !== attributeId),
    ),
  }));
}

function parseTimePoints(value: string) {
  return value
    .split(/[,、\n]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(Number)
    .filter((point) => Number.isFinite(point))
    .map((point, index) => ({ id: `time.${index + 1}`, value: point }));
}

function invalidTimeTokens(value: string): string[] {
  return value
    .split(/[,、\n]/)
    .map((token) => token.trim())
    .filter((token) => token !== "" && !Number.isFinite(Number(token)));
}

function nextIndexedId(items: readonly { id: string }[], prefix: string): string {
  const maximum = items.reduce((current, item) => {
    const match = item.id.match(new RegExp(`^${prefix}\\.(\\d+)$`));
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}.${maximum + 1}`;
}

function withSessionCount(
  sessions: readonly ExperimentSessionDraft[],
  requestedCount: number,
): ExperimentSessionDraft[] {
  const count = Math.min(12, Math.max(1, Math.round(requestedCount) || 1));
  if (count <= sessions.length) return sessions.slice(0, count);
  return [
    ...sessions,
    ...Array.from({ length: count - sessions.length }, (_, index) =>
      createExperimentSession(sessions.length + index + 1),
    ),
  ];
}

function matchedUnitLabel(unitLabel: string, index: number): string {
  return `${unitLabel.trim() || "対応単位"} ${index + 1}`;
}

function acceptSingleClick(detail: number): boolean {
  return detail <= 1;
}

function asMatchedUnits(draft: ExperimentSetDraft): ExperimentSetDraft {
  return {
    ...draft,
    conditionAssignment: {
      ...draft.conditionAssignment,
      kind: "matched",
      matchedTopology: { kind: "same_entity_across_conditions" },
    },
    experiments: draft.experiments.map((session, index) => ({
      ...session,
      label: matchedUnitLabel(draft.conditionAssignment.unitLabel, index),
      stableUnitId: session.stableUnitId || `unit.${index + 1}`,
    })),
  };
}

function asIndependentUnits(draft: ExperimentSetDraft): ExperimentSetDraft {
  return {
    ...draft,
    conditionAssignment: {
      kind: "independent",
      unitLabel: draft.conditionAssignment.unitLabel,
    },
  };
}

function Stepper({
  activeStep,
  steps,
  furthestStep,
  confirmationEnabled,
  onSelect,
}: {
  activeStep: FlowStep;
  steps: readonly FlowStep[];
  furthestStep: FlowStep;
  confirmationEnabled: boolean;
  onSelect: (step: FlowStep) => void;
}) {
  return (
    <ol className="experiment-start__stepper" aria-label="実験設計の進み具合">
      {steps.map((step, index) => {
        const label = STEP_LABELS[step];
        const enabled = step <= furthestStep && (step !== 4 || confirmationEnabled);
        return (
          <li
            className={`experiment-start__step${step === activeStep ? " is-active" : ""}${
              step < furthestStep && step !== activeStep ? " is-complete" : ""
            }`}
            key={label}
          >
            <button
              type="button"
              aria-current={step === activeStep ? "step" : undefined}
              aria-label={`${index + 1}. ${label}`}
              disabled={!enabled}
              onClick={(event) => acceptSingleClick(event.detail) && onSelect(step)}
            >
              <span className="experiment-start__step-number">{index + 1}</span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ContextStart({
  onSelect,
  selectedContext,
  onRouteSelect,
  onContextBack,
  onDemoSelect,
  onSpecializedNavigate,
  browserPreview = false,
  showDemos = true,
}: {
  onSelect: (context: ExperimentContext) => void;
  selectedContext: Exclude<ExperimentContext, "existing_data"> | null;
  onRouteSelect: (route: ExperimentEntryRoute) => void;
  onContextBack: () => void;
  onDemoSelect: (fixture: SyntheticFixture) => void;
  onSpecializedNavigate: (route: AppRoute) => void;
  browserPreview?: boolean;
  showDemos?: boolean;
}) {
  const demos = syntheticFixtures();
  const fiveMinuteDemoIds = new Set([
    "independent_two_group",
    "simple_independent_continuous",
    "paired_two_condition",
    "nested_continuous",
    "longitudinal",
    "wb_reference",
  ]);
  const fiveMinuteDemos = demos.filter(({ id }) => fiveMinuteDemoIds.has(id));
  const additionalDemos = demos.filter(({ id }) => !fiveMinuteDemoIds.has(id));
  if (selectedContext) {
    return (
      <section className="experiment-start__context-card" aria-labelledby="entry-route-heading">
        <div className="experiment-start__section-heading">
          <div>
            <p className="experiment-start__eyebrow">{CONTEXT_LABELS[selectedContext]}</p>
            <h2 id="entry-route-heading">今回、主に何を解析しましたか？</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={(event) => acceptSingleClick(event.detail) && onContextBack()}
          >
            種類を戻す
          </button>
        </div>
        <p className="experiment-start__context-note">
          試料の由来ではなく、今回主に解析した内容に最も近いものを選んでください。
        </p>
        <div className="experiment-start__entry-route-grid">
          {ENTRY_ROUTES[selectedContext].map((route) => (
            <button
              key={route.id}
              type="button"
              onClick={(event) => acceptSingleClick(event.detail) && onRouteSelect(route)}
            >
              <strong>{route.title}</strong>
              <span>{route.description}</span>
            </button>
          ))}
        </div>
        <p className="experiment-start__context-note">
          eventまでの時間や反応曲線も、この実験分野から選べます。入力時にidentityと観測構造を確認します。
        </p>
      </section>
    );
  }
  return (
    <>
      <section
        className="experiment-start__context-card"
        aria-labelledby="context-heading"
        data-review-entry={browserPreview ? "phase-a" : undefined}
      >
        <div className="experiment-start__section-heading">
          <div>
            <p className="experiment-start__eyebrow">
              {browserPreview ? "実験内容から始める" : "最初の質問"}
            </p>
            <h2 id="context-heading">どのような実験ですか？</h2>
          </div>
          <span className="experiment-start__hint">実験の背景から選びます</span>
        </div>
        <div className="experiment-start__context-grid">
          {EXPERIMENT_CONTEXT_OPTIONS.map((option, index) => (
            <button
              className={`experiment-start__context-option${option.available ? "" : " is-disabled"}`}
              data-context={option.id}
              disabled={!option.available}
              key={option.id}
              type="button"
              onClick={(event) =>
                acceptSingleClick(event.detail) && option.available && onSelect(option.id)
              }
            >
              <span className={`experiment-start__context-icon context-icon--${index + 1}`}>
                {index + 1}
              </span>
              <span className="experiment-start__context-copy">
                <span className="experiment-start__context-title">{option.title}</span>
                <span className="experiment-start__context-description">{option.description}</span>
              </span>
              {!option.available ? (
                <span className="experiment-start__context-status">準備中</span>
              ) : null}
            </button>
          ))}
        </div>
        <p className="experiment-start__context-note">
          {browserPreview
            ? "通常の新規実験フローを最初から確認します。入力内容はブラウザ内だけに一時保持されます。"
            : "今回主に解析した内容に近い入口を選びます。統計名や解析IDは選びません。"}
        </p>
      </section>
      {showDemos ? (
        <section
          className="experiment-start__demo-card"
          aria-labelledby="demo-heading"
          data-review-entry={browserPreview ? "phase-b" : undefined}
        >
          <div>
            <p className="experiment-start__eyebrow">
              {browserPreview ? "合成データで試す" : "5分で試す"}
            </p>
            <h2 id="demo-heading">合成デモデータですぐ試す</h2>
            <p>
              {browserPreview
                ? "一時プレビューでは合成データだけを使用できます。ローカルファイルや実測データには接続しません。"
                : "実測データではありません。毎回同じ値を使い、画面確認をすぐ始められます。"}
            </p>
          </div>
          <div className="experiment-start__demo-options">
            {fiveMinuteDemos.map((fixture) => (
              <button
                key={fixture.id}
                type="button"
                onClick={(event) => acceptSingleClick(event.detail) && onDemoSelect(fixture)}
              >
                <strong>{fixture.title}</strong>
                <span>{fixture.description}</span>
              </button>
            ))}
          </div>
          {additionalDemos.length > 0 ? (
            <details>
              <summary>ほかの合成デモを見る</summary>
              <div className="experiment-start__demo-options">
                {additionalDemos.map((fixture) => (
                  <button
                    key={fixture.id}
                    type="button"
                    onClick={(event) => acceptSingleClick(event.detail) && onDemoSelect(fixture)}
                  >
                    <strong>{fixture.title}</strong>
                    <span>{fixture.description}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      <section className="experiment-start__specialized" aria-labelledby="specialized-heading">
        <details>
          <summary id="specialized-heading">既存の解析用データを直接入力する</summary>
          <p>実験分野を選ばず、整形済みの表や行列を直接入力したい場合の補助入口です。</p>
          <div className="experiment-start__entry-route-grid">
            {specializedAnalysisRoutes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={(event) =>
                  acceptSingleClick(event.detail) && onSpecializedNavigate(route.id)
                }
              >
                <strong>{route.title}</strong>
                <span>{route.description}</span>
              </button>
            ))}
          </div>
        </details>
      </section>
    </>
  );
}

function ReadoutStep({
  draft,
  onUpdate,
}: {
  draft: ExperimentSetDraft;
  onUpdate: (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => void;
}) {
  const updateReadout = (
    readoutId: string,
    patch: Partial<ExperimentSetDraft["readouts"][number]>,
  ) =>
    onUpdate((current) => ({
      ...current,
      readouts: current.readouts.map((item) =>
        item.id === readoutId ? { ...item, ...patch } : item,
      ),
    }));
  const addReadout = () =>
    onUpdate((current) => {
      const nextIndex =
        current.readouts.reduce((maximum, item) => {
          const match = item.id.match(/readout\.(\d+)$/);
          return Math.max(maximum, match ? Number(match[1]) : 0);
        }, 0) + 1;
      return {
        ...current,
        readouts: [
          ...current.readouts,
          {
            id: `readout.${nextIndex}`,
            label: `測定項目 ${nextIndex}`,
            shape: "nested_continuous",
            unit: "a.u.",
          },
        ],
      };
    });
  const availableReadoutOptions = READOUT_OPTIONS.filter((option) => {
    if (draft.entryRoute === "protein_wb") return false;
    if (draft.context === "protein_biochemical") return option.shape === "nested_continuous";
    if (draft.context === "microscopy_imaging" || draft.context === "cell_culture") {
      return option.shape === "nested_continuous" || option.shape === "proportion";
    }
    return option.shape !== "wb_ratio";
  });
  return (
    <section className="experiment-start__form-card" aria-labelledby="readout-heading">
      <div className="experiment-start__section-heading">
        <div>
          <p className="experiment-start__eyebrow">実験設計</p>
          <h2 id="readout-heading">何を測りましたか？</h2>
        </div>
        <span className="experiment-start__hint">測定項目はあとで編集できます</span>
      </div>
      {draft.analysisIntent.kind === "correlation" ? (
        <p className="experiment-start__helper">
          同じ実験単位から得たXとYを1組として入力します。関係の評価方法は、データ入力後に統計画面で確認します。
        </p>
      ) : (
        <>
          {draft.entryRoute === "protein_wb" ? (
            <fieldset className="experiment-start__fieldset">
              <legend>どのバンド値を入力しますか？</legend>
              <div className="experiment-start__radio-row">
                <label className="experiment-start__radio-card">
                  <input
                    checked={draft.readouts[0]?.shape === "wb_ratio"}
                    name="wb-kind"
                    type="radio"
                    onChange={() =>
                      updateReadout(draft.readouts[0].id, {
                        shape: "wb_ratio",
                        label: "標的タンパク質",
                        unit: "ratio",
                        referenceLabel: draft.readouts[0].referenceLabel || "GAPDH",
                        wbInputMode: draft.readouts[0].wbInputMode ?? "corrected_value",
                      })
                    }
                  />
                  <span>
                    <strong>Target + reference</strong>
                    <small>両方を保存し、Target/referenceを計算します。</small>
                  </span>
                </label>
                <label className="experiment-start__radio-card">
                  <input
                    checked={
                      draft.readouts[0]?.shape === "nested_continuous" &&
                      draft.readouts[0]?.unit !== "normalized"
                    }
                    name="wb-kind"
                    type="radio"
                    onChange={() =>
                      updateReadout(draft.readouts[0].id, {
                        shape: "nested_continuous",
                        label: "標的バンド強度",
                        unit: "a.u.",
                        referenceLabel: undefined,
                        wbInputMode: undefined,
                        withinExperimentNormalization: undefined,
                      })
                    }
                  />
                  <span>
                    <strong>Targetのみ</strong>
                    <small>入力値をそのまま保存し、自動正規化しません。</small>
                  </span>
                </label>
                <label className="experiment-start__radio-card">
                  <input
                    checked={draft.readouts[0]?.unit === "normalized"}
                    name="wb-kind"
                    type="radio"
                    onChange={() =>
                      updateReadout(draft.readouts[0].id, {
                        shape: "nested_continuous",
                        label: "正規化済みWB値",
                        unit: "normalized",
                        referenceLabel: undefined,
                        wbInputMode: undefined,
                        withinExperimentNormalization: undefined,
                      })
                    }
                  />
                  <span>
                    <strong>すでに正規化した値</strong>
                    <small>外部で算出済みの値として入力します。</small>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}
          <div className="experiment-start__readout-list">
            {draft.readouts.map((readout, readoutIndex) => (
              <fieldset className="experiment-start__fieldset" key={readout.id}>
                <legend>測定項目 {readoutIndex + 1}</legend>
                {availableReadoutOptions.length > 1 ? (
                  <div className="experiment-start__choice-grid">
                    {availableReadoutOptions.map((option) => (
                      <label
                        className={`experiment-start__choice-card${
                          readout.shape === option.shape ? " is-selected" : ""
                        }`}
                        key={option.shape}
                      >
                        <input
                          checked={readout.shape === option.shape}
                          name={`readout-shape-${readout.id}`}
                          type="radio"
                          value={option.shape}
                          onChange={() =>
                            updateReadout(readout.id, {
                              shape: option.shape,
                              ...(option.shape !== "wb_ratio"
                                ? {
                                    referenceLabel: undefined,
                                    wbInputMode: undefined,
                                    withinExperimentNormalization: undefined,
                                  }
                                : {
                                    referenceLabel: readout.referenceLabel || "GAPDH",
                                    wbInputMode: readout.wbInputMode ?? "corrected_value",
                                  }),
                              ...(option.shape === "categorical_counts" && !readout.categories
                                ? {
                                    categories: [
                                      { id: `${readout.id}.category.1`, label: "Category A" },
                                      { id: `${readout.id}.category.2`, label: "Category B" },
                                      { id: `${readout.id}.category.3`, label: "Category C" },
                                    ],
                                  }
                                : {}),
                            })
                          }
                        />
                        <span>
                          <strong>{option.title}</strong>
                          <span>{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="experiment-start__field-row">
                  <label className="experiment-start__field">
                    <span>測定項目の名前</span>
                    <input
                      aria-label={
                        readoutIndex === 0 ? "測定項目の名前" : `測定項目${readoutIndex + 1}の名前`
                      }
                      value={readout.label}
                      onChange={(event) => updateReadout(readout.id, { label: event.target.value })}
                    />
                  </label>
                  {readout.shape === "nested_continuous" ? (
                    <label className="experiment-start__field experiment-start__field--small">
                      <span>単位（任意）</span>
                      <input
                        aria-label={
                          readoutIndex === 0 ? "測定単位" : `測定項目${readoutIndex + 1}の単位`
                        }
                        placeholder="例：µm、a.u."
                        value={readout.unit ?? ""}
                        onChange={(event) =>
                          updateReadout(readout.id, { unit: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  {readout.shape === "nested_continuous" &&
                  draft.context === "microscopy_imaging" ? (
                    <fieldset className="experiment-start__fieldset experiment-start__wb-normalization">
                      <legend>1つの実験単位から何を入力しますか？</legend>
                      <label>
                        <input
                          checked={readout.nestedInputMode === "unit_summary"}
                          name={`nested-input-${readout.id}`}
                          type="radio"
                          onChange={() =>
                            updateReadout(readout.id, { nestedInputMode: "unit_summary" })
                          }
                        />
                        ディッシュ・動物・試料ごとの要約値を1つ
                      </label>
                      <label>
                        <input
                          checked={
                            (readout.nestedInputMode ?? "nested_observations") ===
                            "nested_observations"
                          }
                          name={`nested-input-${readout.id}`}
                          type="radio"
                          onChange={() =>
                            updateReadout(readout.id, { nestedInputMode: "nested_observations" })
                          }
                        />
                        各実験単位内のCell・ROI値を複数
                      </label>
                      <small>
                        Cell・ROIを複数入力しても、それらの個数を生物学的nにはしません。実験単位ごとに要約します。
                      </small>
                    </fieldset>
                  ) : null}
                  {readout.shape === "categorical_counts" ? (
                    <label className="experiment-start__field">
                      <span>カテゴリ名（カンマ区切り）</span>
                      <input
                        aria-label={
                          readoutIndex === 0
                            ? "カテゴリ名"
                            : `測定項目${readoutIndex + 1}のカテゴリ名`
                        }
                        value={readout.categories?.map(({ label }) => label).join(", ") ?? ""}
                        onChange={(event) => {
                          const labels = event.target.value
                            .split(/[,、]/)
                            .map((label) => label.trim())
                            .filter(Boolean)
                            .slice(0, 10);
                          updateReadout(readout.id, {
                            categories: labels.map((label, index) => ({
                              id: `${readout.id}.category.${index + 1}`,
                              label,
                            })),
                          });
                        }}
                      />
                    </label>
                  ) : null}
                  {readout.shape === "wb_ratio" ? (
                    <>
                      <label className="experiment-start__field experiment-start__field--small">
                        <span>referenceの名前</span>
                        <input
                          aria-label={
                            readoutIndex === 0
                              ? "referenceの名前"
                              : `測定項目${readoutIndex + 1}のreferenceの名前`
                          }
                          placeholder="例：GAPDH、total protein"
                          value={readout.referenceLabel ?? ""}
                          onChange={(event) =>
                            updateReadout(readout.id, { referenceLabel: event.target.value })
                          }
                        />
                      </label>
                      <fieldset className="experiment-start__fieldset experiment-start__wb-normalization">
                        <legend>バンド値の入力方法</legend>
                        <label>
                          <input
                            checked={
                              (readout.wbInputMode ?? "corrected_value") === "corrected_value"
                            }
                            name={`wb-input-${readout.id}`}
                            type="radio"
                            onChange={() =>
                              updateReadout(readout.id, { wbInputMode: "corrected_value" })
                            }
                          />
                          補正済みのバンド値を入力
                        </label>
                        <label>
                          <input
                            checked={readout.wbInputMode === "imagej_mean_background_area"}
                            name={`wb-input-${readout.id}`}
                            type="radio"
                            onChange={() =>
                              updateReadout(readout.id, {
                                wbInputMode: "imagej_mean_background_area",
                              })
                            }
                          />
                          ImageJのIntensity・Background・Areaから計算
                        </label>
                        <small>
                          後者は Mean intensity と Mean background にだけ （Intensity −
                          Background）× Area を適用します。RawIntDenを同じ値とは扱いません。
                        </small>
                      </fieldset>
                      <fieldset className="experiment-start__fieldset experiment-start__wb-normalization">
                        <legend>target/reference後の追加正規化</legend>
                        <label>
                          <input
                            checked={!readout.withinExperimentNormalization}
                            name={`wb-normalization-${readout.id}`}
                            type="radio"
                            onChange={() =>
                              updateReadout(readout.id, {
                                withinExperimentNormalization: undefined,
                              })
                            }
                          />
                          追加しない
                        </label>
                        <label>
                          <input
                            checked={
                              readout.withinExperimentNormalization?.method === "control_equals_one"
                            }
                            name={`wb-normalization-${readout.id}`}
                            type="radio"
                            onChange={() =>
                              updateReadout(readout.id, {
                                withinExperimentNormalization: {
                                  method: "control_equals_one",
                                  baselineConditionId: draft.conditions[0]?.id,
                                },
                              })
                            }
                          />
                          各実験回で先頭の条件を1にする
                        </label>
                        <label>
                          <input
                            checked={
                              readout.withinExperimentNormalization?.method === "per_unit_maximum"
                            }
                            name={`wb-normalization-${readout.id}`}
                            type="radio"
                            onChange={() =>
                              updateReadout(readout.id, {
                                withinExperimentNormalization: { method: "per_unit_maximum" },
                              })
                            }
                          />
                          各実験回の最大値を1にする
                        </label>
                        <small>選んだ場合だけ適用し、標的・referenceの生値は残します。</small>
                      </fieldset>
                    </>
                  ) : null}
                  {draft.context === "protein_biochemical" &&
                  readout.shape === "nested_continuous" ? (
                    <p className="experiment-start__helper">
                      referenceなしのWB強度はこの形式で入力値をそのまま保存します。自動正規化は行いません。
                    </p>
                  ) : null}
                  {draft.readouts.length > 1 ? (
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label={`測定項目${readoutIndex + 1}を削除`}
                      onClick={() =>
                        onUpdate((current) => ({
                          ...current,
                          readouts: current.readouts.filter(({ id }) => id !== readout.id),
                        }))
                      }
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </fieldset>
            ))}
          </div>
          <button
            className="secondary-button"
            disabled={draft.readouts.length >= 6}
            type="button"
            onClick={addReadout}
          >
            ＋ 測定項目を追加
          </button>
        </>
      )}
    </section>
  );
}

function ConditionUnitRelationship({
  draft,
  onUpdate,
  explicitAnswers,
  onExplicitAnswersUpdate,
}: {
  draft: ExperimentSetDraft;
  onUpdate: (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => void;
  explicitAnswers: ExplicitStructureAnswers;
  onExplicitAnswersUpdate: (
    updater: (current: ExplicitStructureAnswers) => ExplicitStructureAnswers,
  ) => void;
}) {
  return (
    <fieldset className="experiment-start__fieldset">
      <legend>各条件で測った対象・試料は、どのような関係ですか？</legend>
      <p className="experiment-start__helper">
        統計手法ではなく、実際に対象・試料を準備して条件を割り当てた関係を選んでください。
      </p>
      <div className="experiment-start__radio-row">
        <label className="experiment-start__radio-card">
          <input
            checked={
              explicitAnswers.conditionAssignment &&
              !explicitAnswers.sharedSourceSplit &&
              draft.conditionAssignment.kind === "independent"
            }
            name="condition-unit-relationship"
            type="radio"
            onChange={() => {
              onExplicitAnswersUpdate((current) => ({
                ...current,
                conditionAssignment: true,
                sharedSourceSplit: false,
              }));
              onUpdate(asIndependentUnits);
            }}
          />
          <span>
            <strong>条件ごとに別の単位を準備・処理した</strong>
            <small>条件間で同じ対象・試料のIDとして対応づけません。</small>
          </span>
        </label>
        <label className="experiment-start__radio-card">
          <input
            checked={
              explicitAnswers.conditionAssignment &&
              !explicitAnswers.sharedSourceSplit &&
              draft.conditionAssignment.kind === "matched"
            }
            name="condition-unit-relationship"
            type="radio"
            onChange={() => {
              onExplicitAnswersUpdate((current) => ({
                ...current,
                conditionAssignment: true,
                sharedSourceSplit: false,
              }));
              onUpdate(asMatchedUnits);
            }}
          />
          <span>
            <strong>同じ単位を条件間で測った</strong>
            <small>同じ対象そのものを複数条件で測り、各条件の値を1組として入力できます。</small>
          </span>
        </label>
        <label className="experiment-start__radio-card">
          <input
            checked={explicitAnswers.sharedSourceSplit}
            name="condition-unit-relationship"
            type="radio"
            onChange={() =>
              onExplicitAnswersUpdate((current) => ({
                ...current,
                conditionAssignment: false,
                sharedSourceSplit: true,
              }))
            }
          />
          <span>
            <strong>同じ由来試料を分けて各条件に割り当てた</strong>
            <small>例：同じドナーや調製試料から分けた、条件ごとの別ディッシュ・別試料。</small>
          </span>
        </label>
      </div>
      {explicitAnswers.sharedSourceSplit ? (
        <p className="experiment-start__validation" role="status">
          この入口はまだ、共有した由来IDと条件ごとの別の対象・試料IDを同時に保持できません。別の実験構造へ読み替えず、この選択のまま停止しています。入力した条件名は画面内に保持されます。
        </p>
      ) : null}
    </fieldset>
  );
}

function ConditionsStep({
  draft,
  onUpdate,
  explicitAnswers,
  onExplicitAnswersUpdate,
}: {
  draft: ExperimentSetDraft;
  onUpdate: (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => void;
  explicitAnswers: ExplicitStructureAnswers;
  onExplicitAnswersUpdate: (
    updater: (current: ExplicitStructureAnswers) => ExplicitStructureAnswers,
  ) => void;
}) {
  if (draft.analysisIntent.kind === "correlation") {
    return (
      <section className="experiment-start__form-card" aria-labelledby="conditions-heading">
        <div className="experiment-start__section-heading">
          <div>
            <p className="experiment-start__eyebrow">実験設計</p>
            <h2 id="conditions-heading">XとYの名前を入力してください</h2>
          </div>
          <span className="experiment-start__hint">同じ実験単位の1組として入力します</span>
        </div>
        <div className="experiment-start__field-row">
          {draft.conditions.map((condition, index) => (
            <label className="experiment-start__field" key={condition.id}>
              <span>{index === 0 ? "X（横軸）" : "Y（縦軸）"}</span>
              <input
                aria-label={index === 0 ? "Xの名前" : "Yの名前"}
                value={condition.label}
                onChange={(event) =>
                  onUpdate((current) => ({
                    ...current,
                    conditions: current.conditions.map((item) =>
                      item.id === condition.id
                        ? {
                            ...item,
                            label: event.target.value,
                            attributes: { "attribute.variable": event.target.value },
                          }
                        : item,
                    ),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p className="experiment-start__helper">
          例：Xを「細胞面積」、Yを「蛍光強度」とします。各Expで両方がそろった組だけを相関解析に使います。
        </p>
      </section>
    );
  }
  const moveConditionGridFocus = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    const movement: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [event.shiftKey ? -1 : 1, 0],
    };
    const delta = movement[event.key];
    if (!delta || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(
        `[data-condition-row="${rowIndex + delta[0]}"][data-condition-column="${
          columnIndex + delta[1]
        }"]`,
      );
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };

  const appendRows = (count = 5) => {
    if (draft.conditions.length >= 50) return;
    onUpdate((current) => {
      const conditions = [...current.conditions];
      const rowsToAdd = Math.min(count, 50 - conditions.length);
      for (let index = 0; index < rowsToAdd; index += 1) {
        conditions.push({
          id: nextIndexedId(conditions, "condition"),
          label: "",
          attributes: Object.fromEntries(current.attributes.map((attribute) => [attribute.id, ""])),
        });
      }
      return { ...current, conditions };
    });
  };

  const addAttribute = () => {
    if (draft.attributes.length >= 6) return;
    const attribute = {
      id: nextIndexedId(draft.attributes, "attribute"),
      label: `列${draft.attributes.length + 1}`,
    };
    onUpdate((current) => ({
      ...current,
      attributes: [...current.attributes, attribute],
      conditions: current.conditions.map((condition) => ({
        ...condition,
        attributes: { ...condition.attributes, [attribute.id]: "" },
      })),
    }));
  };

  const removeAttribute = (attributeId: string) => {
    onUpdate((current) => ({
      ...current,
      attributes: current.attributes.filter((attribute) => attribute.id !== attributeId),
      conditions: removeAttributeValues(current.conditions, attributeId, current.attributes),
    }));
  };

  const updateDescriptor = (conditionId: string, attributeId: string, value: string) => {
    onUpdate((current) => {
      const conditions = current.conditions.map((condition) => {
        if (condition.id !== conditionId) return condition;
        const nextCondition = {
          ...condition,
          attributes: { ...condition.attributes, [attributeId]: value },
        };
        return {
          ...nextCondition,
          label: conditionDisplayLabel(nextCondition, current.attributes),
        };
      });
      const rowIndex = conditions.findIndex((condition) => condition.id === conditionId);
      if (rowIndex === conditions.length - 1 && conditions.length < 50) {
        const id = nextIndexedId(conditions, "condition");
        conditions.push({
          id,
          label: "",
          attributes: Object.fromEntries(current.attributes.map((attribute) => [attribute.id, ""])),
        });
      }
      return {
        ...current,
        conditions,
        controlConditionId:
          current.controlConditionId === conditionId &&
          !Object.values(conditions[rowIndex]?.attributes ?? {}).some((item) => item.trim() !== "")
            ? undefined
            : current.controlConditionId,
      };
    });
  };

  const pasteDescriptors = (startRow: number, startColumn: number, text: string): boolean => {
    if (text === "") return false;
    const pastedRows = text.replace(/\r\n?/g, "\n").split("\n");
    while (pastedRows.at(-1) === "") pastedRows.pop();
    onUpdate((current) => {
      const requiredRows = Math.min(50, startRow + pastedRows.length + 1);
      const conditions = [...current.conditions];
      while (conditions.length < requiredRows) {
        conditions.push({
          id: nextIndexedId(conditions, "condition"),
          label: "",
          attributes: Object.fromEntries(current.attributes.map((attribute) => [attribute.id, ""])),
        });
      }
      pastedRows.forEach((line, rowOffset) => {
        const condition = conditions[startRow + rowOffset];
        if (!condition) return;
        const nextAttributes = { ...condition.attributes };
        line.split("\t").forEach((value, columnOffset) => {
          const attribute = current.attributes[startColumn + columnOffset];
          if (attribute) nextAttributes[attribute.id] = value;
        });
        const nextCondition = { ...condition, attributes: nextAttributes };
        conditions[startRow + rowOffset] = {
          ...nextCondition,
          label: conditionDisplayLabel(nextCondition, current.attributes),
        };
      });
      return { ...current, conditions };
    });
    return true;
  };
  const showControlColumn = activeConditions(draft).length >= 3;

  return (
    <section className="experiment-start__form-card" aria-labelledby="conditions-heading">
      <div className="experiment-start__section-heading">
        <div>
          <p className="experiment-start__eyebrow">実験設計</p>
          <h2 id="conditions-heading">条件を入力してください</h2>
        </div>
        <span className="experiment-start__hint">空行は条件として数えません</span>
      </div>
      <p className="experiment-start__helper">
        表計算ソフトから矩形のまま貼り付けられます。「Gene A
        #1」は1セルのままで構いません。階層表示したい場合だけGeneとSequenceのように列を分けます。
      </p>
      {draft.analysisIntent.kind === "single_cohort" ? (
        <fieldset className="experiment-start__fieldset">
          <legend>この1群で何を行いますか？</legend>
          <label className="experiment-start__radio-card">
            <input
              type="radio"
              name="single-cohort-mode"
              checked={draft.analysisIntent.mode === "descriptive"}
              onChange={() =>
                onUpdate((current) => ({
                  ...current,
                  analysisIntent: { kind: "single_cohort", mode: "descriptive" },
                }))
              }
            />
            <span>
              <strong>分布と記述統計のみ</strong>
              <small>比較群や基準値を作らず、Graphと要約を表示します。</small>
            </span>
          </label>
          <label className="experiment-start__radio-card">
            <input
              type="radio"
              name="single-cohort-mode"
              checked={draft.analysisIntent.mode === "one_sample"}
              onChange={() =>
                onUpdate((current) => ({
                  ...current,
                  analysisIntent: {
                    kind: "single_cohort",
                    mode: "one_sample",
                    referenceValue:
                      current.analysisIntent.kind === "single_cohort"
                        ? current.analysisIntent.referenceValue
                        : undefined,
                  },
                }))
              }
            />
            <span>
              <strong>既知の基準値と比較</strong>
              <small>基準値を明示してone-sample t-testを実行できます。</small>
            </span>
          </label>
          {draft.analysisIntent.mode === "one_sample" ? (
            <label className="experiment-start__field">
              <span>基準値（必須）</span>
              <input
                aria-label="one-sample基準値"
                type="number"
                value={draft.analysisIntent.referenceValue ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  onUpdate((current) => ({
                    ...current,
                    analysisIntent: {
                      kind: "single_cohort",
                      mode: "one_sample",
                      ...(value === "" ? {} : { referenceValue: Number(value) }),
                    },
                  }));
                }}
              />
              <small>0を暗黙には使いません。科学的に定義された値を入力してください。</small>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      <div className="experiment-start__condition-table-wrap">
        <table className="experiment-start__condition-table">
          <thead>
            <tr>
              <th className="experiment-start__row-number" scope="col">
                No.
              </th>
              {showControlColumn ? (
                <th className="experiment-start__control-column" scope="col">
                  対照
                </th>
              ) : null}
              {draft.attributes.map((attribute) => (
                <th scope="col" key={attribute.id}>
                  <label className="experiment-start__table-heading-field">
                    <span className="sr-only">属性名</span>
                    <input
                      aria-label={`${attribute.label || "属性"}の列名`}
                      value={attribute.label}
                      onChange={(event) =>
                        onUpdate((current) => ({
                          ...current,
                          attributes: updateAttributeLabel(
                            current.attributes,
                            attribute.id,
                            event.target.value,
                          ),
                        }))
                      }
                    />
                    {attribute.id !== draft.attributes[0]?.id ? (
                      <button
                        aria-label={`${attribute.label || "列"}を削除`}
                        className="experiment-start__icon-button"
                        type="button"
                        onClick={() => removeAttribute(attribute.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.conditions.map((condition, index) => (
              <tr key={condition.id}>
                <th className="experiment-start__row-number" scope="row">
                  {index + 1}
                </th>
                {showControlColumn ? (
                  <td className="experiment-start__control-cell">
                    <input
                      aria-label={`条件${index + 1}を対照群に指定`}
                      checked={draft.controlConditionId === condition.id}
                      disabled={
                        !Object.values(condition.attributes).some((value) => value.trim() !== "")
                      }
                      name="control-condition"
                      type="radio"
                      onChange={() =>
                        onUpdate((current) => ({
                          ...current,
                          controlConditionId: condition.id,
                        }))
                      }
                    />
                  </td>
                ) : null}
                {draft.attributes.map((attribute, columnIndex) => (
                  <td key={attribute.id}>
                    <input
                      aria-label={`行${index + 1}：${attribute.label || `列${columnIndex + 1}`}`}
                      value={condition.attributes[attribute.id] ?? ""}
                      data-condition-row={index}
                      data-condition-column={columnIndex}
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => moveConditionGridFocus(event, index, columnIndex)}
                      onChange={(event) =>
                        updateDescriptor(condition.id, attribute.id, event.target.value)
                      }
                      onPaste={(event) => {
                        if (
                          pasteDescriptors(index, columnIndex, event.clipboardData.getData("text"))
                        ) {
                          event.preventDefault();
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="experiment-start__inline-actions">
        <button
          className="secondary-button"
          disabled={draft.conditions.length >= 50}
          type="button"
          onClick={() => appendRows()}
        >
          ＋ 行を追加
        </button>
        <button
          className="secondary-button"
          disabled={draft.attributes.length >= 6}
          type="button"
          onClick={addAttribute}
        >
          ＋ 列を追加（任意）
        </button>
      </div>
      {showControlColumn ? (
        <p className="experiment-start__helper">
          対照は必要な場合だけ明示してください。名前がControl・WT・Vehicleでも自動判定せず、選んだ条件IDを保存します。
        </p>
      ) : null}
      {draft.entryRoute === "protein_wb" ? (
        <ConditionUnitRelationship
          draft={draft}
          onUpdate={onUpdate}
          explicitAnswers={explicitAnswers}
          onExplicitAnswersUpdate={onExplicitAnswersUpdate}
        />
      ) : null}
    </section>
  );
}

function TimeStep({
  draft,
  onUpdate,
  explicitAnswers,
  onExplicitAnswersUpdate,
}: {
  draft: ExperimentSetDraft;
  onUpdate: (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => void;
  explicitAnswers: ExplicitStructureAnswers;
  onExplicitAnswersUpdate: (
    updater: (current: ExplicitStructureAnswers) => ExplicitStructureAnswers,
  ) => void;
}) {
  if (draft.analysisIntent.kind === "correlation") {
    return (
      <section className="experiment-start__form-card" aria-labelledby="time-heading">
        <div className="experiment-start__section-heading">
          <div>
            <p className="experiment-start__eyebrow">実験設計</p>
            <h2 id="time-heading">XとYの対応を確認</h2>
          </div>
          <span className="experiment-start__hint">時間点による対応は推測しません</span>
        </div>
        <p>
          各ExpのXとYは、同じ{draft.conditionAssignment.unitLabel || "実験単位"}
          から得た1組として保存します。表の行順や同じ日付だけを根拠に対応づけません。
        </p>
      </section>
    );
  }
  const hasOrderedAxis = draft.time.sampling !== "none";
  const hasMultipleConditions = activeConditions(draft).length > 1;
  const axisSemantic = orderedAxisSemantic(draft.time);
  const [pointsText, setPointsText] = useState(() =>
    draft.time.points.map((point) => point.value).join(", "),
  );
  const invalidTokens = invalidTimeTokens(pointsText);

  const setTimeMode = (sampling: TimeSampling) => {
    onUpdate((current) => ({
      ...current,
      time:
        sampling === "none"
          ? { ...current.time, sampling, points: [] }
          : {
              ...current.time,
              sampling,
              points: parseTimePoints(pointsText),
            },
    }));
  };

  return (
    <section className="experiment-start__form-card" aria-labelledby="time-heading">
      <div className="experiment-start__section-heading">
        <div>
          <p className="experiment-start__eyebrow">実験設計</p>
          <h2 id="time-heading">
            {hasMultipleConditions
              ? "条件間の試料の関係と測定軸を確認します"
              : "測定軸を確認します"}
          </h2>
        </div>
        <span className="experiment-start__hint">
          {hasMultipleConditions
            ? "まず条件間で何を共有したかを確認します"
            : "時間や距離などがなければ「順序のある測定軸なし」を選んでください"}
        </span>
      </div>
      {hasMultipleConditions ? (
        <ConditionUnitRelationship
          draft={draft}
          onUpdate={onUpdate}
          explicitAnswers={explicitAnswers}
          onExplicitAnswersUpdate={onExplicitAnswersUpdate}
        />
      ) : null}
      {draft.conditionAssignment.kind === "matched" && !explicitAnswers.sharedSourceSplit ? (
        <label className="experiment-start__field experiment-start__field--small">
          <span>対応づけた単位</span>
          <input
            aria-label="対応づけた単位"
            placeholder="例：動物、細胞、試料"
            value={draft.conditionAssignment.unitLabel}
            onChange={(event) =>
              onUpdate((current) => ({
                ...current,
                conditionAssignment: {
                  ...current.conditionAssignment,
                  unitLabel: event.target.value,
                },
                experiments: current.experiments.map((session, index) => ({
                  ...session,
                  label: matchedUnitLabel(event.target.value, index),
                })),
              }))
            }
          />
        </label>
      ) : null}
      {!explicitAnswers.sharedSourceSplit ? (
        <fieldset className="experiment-start__fieldset">
          <legend>測定軸</legend>
          <div className="experiment-start__radio-row">
            <label className="experiment-start__radio-card">
              <input
                checked={explicitAnswers.orderedAxis && !hasOrderedAxis}
                name="time-mode"
                type="radio"
                onChange={() => {
                  onExplicitAnswersUpdate((current) => ({
                    ...current,
                    orderedAxis: true,
                    axisSemantic: false,
                    axisSampling: false,
                  }));
                  setTimeMode("none");
                }}
              />
              <span>順序のある測定軸なし</span>
            </label>
            <label className="experiment-start__radio-card">
              <input
                checked={explicitAnswers.orderedAxis && hasOrderedAxis}
                name="time-mode"
                type="radio"
                onChange={() => {
                  onExplicitAnswersUpdate((current) => ({
                    ...current,
                    orderedAxis: true,
                    axisSemantic: false,
                    axisSampling: false,
                  }));
                  setTimeMode("cross_sectional");
                }}
              />
              <span>順序のある測定軸を追加する</span>
            </label>
          </div>
        </fieldset>
      ) : null}
      {!explicitAnswers.sharedSourceSplit && hasOrderedAxis && (
        <div className="experiment-start__time-details">
          <fieldset className="experiment-start__fieldset">
            <legend>この軸は何を表しますか？</legend>
            <div className="experiment-start__radio-row">
              <label className="experiment-start__radio-card">
                <input
                  checked={explicitAnswers.axisSemantic && axisSemantic === "time"}
                  name="ordered-axis-semantic"
                  type="radio"
                  onChange={() => {
                    onExplicitAnswersUpdate((current) => ({
                      ...current,
                      axisSemantic: true,
                    }));
                    onUpdate((current) => ({
                      ...current,
                      time: {
                        ...current.time,
                        axisSemantic: "time",
                        axisTitle: "Time",
                        axisUnit: current.time.unit,
                      },
                    }));
                  }}
                />
                <span>
                  <strong>時間</strong>
                  <small>同じ単位または別の単位を、複数の時点で測定。</small>
                </span>
              </label>
              <label className="experiment-start__radio-card">
                <input
                  checked={explicitAnswers.axisSemantic && axisSemantic === "numeric_covariate"}
                  name="ordered-axis-semantic"
                  type="radio"
                  onChange={() => {
                    onExplicitAnswersUpdate((current) => ({
                      ...current,
                      axisSemantic: true,
                    }));
                    onUpdate((current) => ({
                      ...current,
                      time: {
                        ...current.time,
                        axisSemantic: "numeric_covariate",
                        axisTitle:
                          current.time.axisSemantic === "numeric_covariate"
                            ? current.time.axisTitle || "Radius"
                            : "Radius",
                        axisUnit:
                          current.time.axisSemantic === "numeric_covariate"
                            ? current.time.axisUnit || "µm"
                            : "µm",
                      },
                    }));
                  }}
                />
                <span>
                  <strong>時間以外の数値軸</strong>
                  <small>例：Sholl radius、距離、濃度。時間として扱いません。</small>
                </span>
              </label>
            </div>
          </fieldset>
          <div className="experiment-start__field-row">
            {axisSemantic === "time" ? (
              <label className="experiment-start__field experiment-start__field--small">
                <span>時間の単位</span>
                <select
                  aria-label="時間の単位"
                  value={draft.time.unit}
                  onChange={(event) =>
                    onUpdate((current) => ({
                      ...current,
                      time: {
                        ...current.time,
                        unit: event.target.value as TimeUnit,
                        axisUnit: event.target.value,
                      },
                    }))
                  }
                >
                  {TIME_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="experiment-start__field">
                  <span>軸の名前</span>
                  <input
                    aria-label="数値軸の名前"
                    value={draft.time.axisTitle ?? ""}
                    placeholder="例：Radius"
                    onChange={(event) =>
                      onUpdate((current) => ({
                        ...current,
                        time: { ...current.time, axisTitle: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="experiment-start__field experiment-start__field--small">
                  <span>軸の単位</span>
                  <input
                    aria-label="数値軸の単位"
                    value={draft.time.axisUnit ?? ""}
                    placeholder="例：µm"
                    onChange={(event) =>
                      onUpdate((current) => ({
                        ...current,
                        time: { ...current.time, axisUnit: event.target.value },
                      }))
                    }
                  />
                </label>
              </>
            )}
            <label className="experiment-start__field">
              <span>{axisSemantic === "time" ? "時間点" : "軸の水準"}（カンマ区切り）</span>
              <input
                aria-label={axisSemantic === "time" ? "時間点" : "数値軸の水準"}
                inputMode="decimal"
                placeholder="例：0, 24, 48"
                value={pointsText}
                aria-invalid={invalidTokens.length > 0}
                onChange={(event) => {
                  setPointsText(event.target.value);
                  onUpdate((current) => ({
                    ...current,
                    time: { ...current.time, points: parseTimePoints(event.target.value) },
                  }));
                }}
              />
            </label>
          </div>
          {invalidTokens.length > 0 ? (
            <p className="experiment-start__validation" role="status">
              数値として読めない入力はまだ測定軸に含めていません：{invalidTokens.join("、")}
            </p>
          ) : null}
          <fieldset className="experiment-start__fieldset">
            <legend>
              各{axisSemantic === "time" ? "時間点" : "軸水準"}で、どのように測りましたか？
            </legend>
            <div className="experiment-start__radio-row">
              <label className="experiment-start__radio-card">
                <input
                  checked={
                    explicitAnswers.axisSampling && draft.time.sampling === "cross_sectional"
                  }
                  name="time-sampling"
                  type="radio"
                  onChange={() => {
                    onExplicitAnswersUpdate((current) => ({
                      ...current,
                      axisSampling: true,
                    }));
                    setTimeMode("cross_sectional");
                  }}
                />
                <span>
                  <strong>{axisSemantic === "time" ? "時間点" : "軸水準"}ごとに別のサンプル</strong>
                  <small>各水準で別の実験単位を測りました。</small>
                </span>
              </label>
              <label className="experiment-start__radio-card">
                <input
                  checked={explicitAnswers.axisSampling && draft.time.sampling === "longitudinal"}
                  name="time-sampling"
                  type="radio"
                  onChange={() => {
                    onExplicitAnswersUpdate((current) => ({
                      ...current,
                      axisSampling: true,
                    }));
                    setTimeMode("longitudinal");
                  }}
                />
                <span>
                  <strong>
                    同じ単位を各{axisSemantic === "time" ? "時間点" : "軸水準"}で測った
                  </strong>
                  <small>同じ実験単位のidentityを複数の水準で保持します。</small>
                </span>
              </label>
            </div>
          </fieldset>
        </div>
      )}
    </section>
  );
}

function ExperimentsStep({
  draft,
  onUpdate,
}: {
  draft: ExperimentSetDraft;
  onUpdate: (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => void;
}) {
  const matched = draft.conditionAssignment.kind === "matched";
  const unitLabel = draft.conditionAssignment.unitLabel.trim() || "対応単位";
  const updateSession = (sessionId: string, patch: Partial<ExperimentSessionDraft>) => {
    onUpdate((current) => ({
      ...current,
      experiments: current.experiments.map((session) =>
        session.id === sessionId ? { ...session, ...patch } : session,
      ),
    }));
  };

  return (
    <section className="experiment-start__form-card" aria-labelledby="experiments-heading">
      <div className="experiment-start__section-heading">
        <div>
          <p className="experiment-start__eyebrow">実験設計</p>
          <h2 id="experiments-heading">
            {matched ? `測定した${unitLabel}を登録してください` : "実験回を登録してください"}
          </h2>
        </div>
        <span className="experiment-start__hint">
          {matched ? "同じidentityを条件間で保持します" : "日付だけで独立したnを決めません"}
        </span>
      </div>
      <p className="experiment-start__helper">
        {matched
          ? `ここでは実験日数ではなく、両条件で追跡した${unitLabel}の数を登録します。各${unitLabel}には固有IDを付け、条件名とは分けて保存します。`
          : "1つの実験回には、各条件の測定値を1つずつ入力します。同じ日に独立なdishを3枚ずつ測った場合は、同じ日付の実験回を3つ登録してください。条件間で同じ行にあっても、対応ありとは解釈しません。"}
      </p>
      <label className="experiment-start__field experiment-start__experiment-count">
        <span>{matched ? `${unitLabel}の数` : "実験回数"}</span>
        <input
          aria-label={matched ? `${unitLabel}の数` : "実験回数"}
          max={12}
          min={1}
          type="number"
          value={draft.experiments.length}
          onChange={(event) =>
            onUpdate((current) => {
              const sessions = withSessionCount(current.experiments, Number(event.target.value));
              return {
                ...current,
                experiments: matched
                  ? sessions.map((session, index) => ({
                      ...session,
                      label: matchedUnitLabel(unitLabel, index),
                      stableUnitId: session.stableUnitId || `unit.${index + 1}`,
                    }))
                  : sessions,
              };
            })
          }
        />
      </label>
      {matched && draft.experiments.length > 1 ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            onUpdate((current) => ({
              ...current,
              experiments: current.experiments.map((session) => ({
                ...session,
                date: current.experiments[0]?.date ?? session.date,
              })),
            }))
          }
        >
          先頭の測定日をすべてに適用
        </button>
      ) : null}
      <div className="experiment-start__experiment-list">
        {draft.experiments.map((session, index) => (
          <div className="experiment-start__experiment-row" key={session.id}>
            <span className="experiment-start__experiment-index">{index + 1}</span>
            <label className="experiment-start__field">
              <span>{matched ? `${unitLabel} ID` : "実験回の名前"}</span>
              <input
                aria-label={matched ? `${unitLabel} ${index + 1}のID` : `実験回${index + 1}の名前`}
                value={session.label}
                onChange={(event) => updateSession(session.id, { label: event.target.value })}
              />
            </label>
            <label className="experiment-start__field experiment-start__field--date">
              <span>{matched ? "測定日" : "実験日"}</span>
              <input
                aria-label={`${session.label || `実験回${index + 1}`}の実験日`}
                type="date"
                value={session.date}
                onChange={(event) => updateSession(session.id, { date: event.target.value })}
              />
            </label>
            <label className="experiment-start__field">
              <span>メモ（任意）</span>
              <input
                aria-label={`${session.label || `実験回${index + 1}`}のメモ`}
                value={session.note}
                onChange={(event) => updateSession(session.id, { note: event.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function DesignConfirmation({
  draft,
  canSave,
  onEdit,
  onStart,
}: {
  draft: ExperimentSetDraft;
  canSave: boolean;
  onEdit: () => void;
  onStart: () => void;
}) {
  const readout = draft.readouts[0];
  const readoutLabel =
    draft.readouts.length > 1
      ? `${draft.readouts.length}測定項目`
      : (READOUT_OPTIONS.find((option) => option.shape === readout?.shape)?.title ?? "測定値");
  const timeLabel =
    draft.time.sampling === "none"
      ? "順序のある測定軸なし"
      : `${orderedAxisTitle(draft.time)} (${orderedAxisUnit(draft.time) || "単位なし"})・${draft.time.points.length}水準（${
          draft.time.sampling === "longitudinal" ? "同じ単位を反復測定" : "水準ごとに別のサンプル"
        }）`;

  return (
    <div className="experiment-start__confirmation">
      <section
        className="experiment-start__confirmation-intro"
        aria-labelledby="confirmation-heading"
      >
        <p className="experiment-start__eyebrow">入力前の最終確認</p>
        <h1 id="confirmation-heading">この実験の設計を確認</h1>
        <p>
          入力シートを作る前に、実際に行った実験のまとまりを確認します。測定値はまだ入力していません。
        </p>
      </section>

      <section className="experiment-start__summary-card" aria-labelledby="summary-heading">
        <div className="experiment-start__section-heading">
          <div>
            <p className="experiment-start__eyebrow">実験者向けのまとめ</p>
            <h2 id="summary-heading">{CONTEXT_LABELS[draft.context]}の実験</h2>
          </div>
          <span className="experiment-start__summary-readout">{readoutLabel}</span>
        </div>
        <dl className="experiment-start__summary-list">
          <div>
            <dt>測定項目</dt>
            <dd>{draft.readouts.map(({ label }) => label || "名前未入力").join(" ／ ")}</dd>
          </div>
          <div>
            <dt>条件構造</dt>
            <dd>
              {draft.conditions.length}条件・{draft.attributes.length}項目
            </dd>
          </div>
          {draft.controlConditionId ? (
            <div>
              <dt>対照群</dt>
              <dd>
                {draft.conditions.find(({ id }) => id === draft.controlConditionId)?.label ??
                  "指定した条件"}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>条件間の単位</dt>
            <dd>
              {draft.conditionAssignment.kind === "matched"
                ? `同じ${draft.conditionAssignment.unitLabel || "実験単位"}を対応づける`
                : "条件ごとに別の実験単位"}
            </dd>
          </div>
          <div>
            <dt>順序のある測定軸</dt>
            <dd>{timeLabel}</dd>
          </div>
          <div>
            <dt>実験回</dt>
            <dd>
              {draft.experiments.map((experiment) => experiment.label || "名前未入力").join(" ／ ")}
            </dd>
          </div>
        </dl>
      </section>

      <ConditionTimePreview draft={draft} />

      <section
        className="experiment-start__expected-analysis"
        aria-labelledby="expected-analysis-heading"
      >
        <p className="experiment-start__eyebrow">入力前の見込み</p>
        <h2 id="expected-analysis-heading">予定している解析</h2>
        <p>{expectedAnalysisLabel(draft)}</p>
        <small>
          実データの欠損や入力構造を確認したあとに、最終的な推奨を理由とともに更新します。
        </small>
      </section>

      <aside className="experiment-start__temporary-notice" aria-label="保存について">
        <span className="experiment-start__temporary-notice-icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>
            {canSave ? "プロジェクトとして保存できます" : "ブラウザ表示では保存できません"}
          </strong>
          <p>
            {canSave
              ? "入力した測定値、実験回、条件・時間構造、グラフ設定をローカルプロジェクトとして保存し、再編集できます。"
              : "デスクトップ版で開くと、入力内容をローカルプロジェクトとして保存できます。"}
          </p>
        </div>
      </aside>

      <aside className="experiment-start__confirmation-note">
        <span aria-hidden="true">i</span>
        <p>
          解析方法は実データを入力したあとに確認します。この画面では統計名や解析IDを選びません。
        </p>
      </aside>

      <div className="experiment-start__confirmation-actions">
        <button className="secondary-button" type="button" onClick={onEdit}>
          設計を修正
        </button>
        <button className="primary-button primary-button--ready" type="button" onClick={onStart}>
          この設計で入力を始める
        </button>
      </div>
    </div>
  );
}

export function NewExperimentPage({
  onNavigate,
  saveProject,
  saveUnresolvedVisualizationProject,
  openUnresolvedVisualizationProject,
  initialGraphOnlyState = null,
  initialGraphOnlyTarget,
  analysisRunner = defaultAnalysisRunner,
  browserPreview = false,
  analysisAvailable = true,
  initialDraft = null,
  initialFixture = null,
  favoriteGraphDefaults,
  onSaveFavorite,
  onDirtyChange,
  onOpenProject,
  onRequestExit,
  onRegisterSaveHandler,
  onAdaptiveSurvivalReady,
  onDedicatedEntryReady,
  specializedEntryAvailable = false,
  showCompatibilityEntry = false,
}: NewExperimentPageProps) {
  const locale = useAppLocale();
  const evaluationPreview =
    import.meta.env.DEV && browserPreview && evaluationModeIsConfigured(evaluationMode);
  const [stage, setStage] = useState<FlowStage>(
    initialGraphOnlyState
      ? "graph-only"
      : initialFixture
        ? "workspace"
        : initialDraft
          ? "confirmation"
          : "context",
  );
  const [designStep, setDesignStep] = useState<DesignStep>(0);
  const [furthestStep, setFurthestStep] = useState<FlowStep>(initialDraft || initialFixture ? 4 : 0);
  const [draft, setDraft] = useState<ExperimentSetDraft | null>(
    initialFixture?.draft ?? initialDraft,
  );
  const [explicitStructureAnswers, setExplicitStructureAnswers] =
    useState<ExplicitStructureAnswers>(
      initialDraft || initialFixture ? CONFIRMED_STRUCTURE : UNANSWERED_STRUCTURE,
    );
  const [fixtureCells, setFixtureCells] = useState<ExperimentCellMap | undefined>(
    initialFixture?.cells,
  );
  const [fixtureGraphs, setFixtureGraphs] = useState<readonly WorkspaceGraphState[] | undefined>();
  const [selectedContext, setSelectedContext] = useState<Exclude<
    ExperimentContext,
    "existing_data"
  > | null>(null);
  const [compatibilityEntryVisible, setCompatibilityEntryVisible] = useState(false);
  const [pendingGraphOnlyState, setPendingGraphOnlyState] =
    useState<UnresolvedVisualizationProjectState | null>(initialGraphOnlyState);
  const [biologicalHandoffError, setBiologicalHandoffError] = useState<string | null>(null);
  const entryDirtySourcesRef = useRef({ graphOnly: false, biological: false, simple: false });
  const pageRootRef = useRef<HTMLDivElement>(null);
  const returnFocusEntryRef = useRef<NewExperimentEntryId | null>(null);
  const flowSteps = draft ? flowStepsFor(draft) : ([0, 1, 2, 3, 4] as const);
  const taskEntryHubEnabled = adaptiveInputFeatureEnabled();
  const unresolvedVisualizationPersistenceAvailable = Boolean(
    saveUnresolvedVisualizationProject && openUnresolvedVisualizationProject,
  );
  const unresolvedVisualizationEntryAvailable =
    browserPreview || unresolvedVisualizationPersistenceAvailable;
  const dedicatedEntryAvailable = browserPreview || specializedEntryAvailable;

  const updateEntryDirtySource = useCallback(
    (source: "graphOnly" | "biological" | "simple", dirty: boolean) => {
      if (entryDirtySourcesRef.current[source] === dirty) return;
      entryDirtySourcesRef.current = { ...entryDirtySourcesRef.current, [source]: dirty };
      onDirtyChange?.(
        entryDirtySourcesRef.current.graphOnly ||
          entryDirtySourcesRef.current.biological ||
          entryDirtySourcesRef.current.simple,
      );
    },
    [onDirtyChange],
  );
  const updateGraphOnlyDirty = useCallback(
    (dirty: boolean) => updateEntryDirtySource("graphOnly", dirty),
    [updateEntryDirtySource],
  );

  const clearEntryDirtyLifecycle = () => {
    entryDirtySourcesRef.current = { graphOnly: false, biological: false, simple: false };
    onDirtyChange?.(false);
    onRegisterSaveHandler?.(null);
  };

  const requestEntryExit = (actionLabel: string, proceed: () => void) => {
    const confirmedProceed = () => {
      clearEntryDirtyLifecycle();
      proceed();
    };
    if (onRequestExit) {
      onRequestExit({ actionLabel, proceed: confirmedProceed });
      return;
    }
    confirmedProceed();
  };

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const root = pageRootRef.current;
    if (!root) return;
    if (stage === "context" && returnFocusEntryRef.current) {
      const entryId = returnFocusEntryRef.current;
      returnFocusEntryRef.current = null;
      const trigger = root.querySelector<HTMLButtonElement>(
        `[data-entry-id="${entryId}"] button:not(:disabled)`,
      );
      if (trigger) {
        trigger.focus({ preventScroll: true });
        return;
      }
    }
    const focusHeading = (): boolean => {
      const heading = root.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusHeading()) return;

    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [stage]);

  const enterStageFromHub = (entryId: NewExperimentEntryId, nextStage: FlowStage) => {
    returnFocusEntryRef.current = entryId;
    recordUsageEntry(
      "new-experiment",
      entryId === "graphOnly" ? "graph_only" : "experiment_interview",
    );
    setStage(nextStage);
  };

  const updateDraft = (updater: (current: ExperimentSetDraft) => ExperimentSetDraft) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const selectContext = (context: ExperimentContext) => {
    if (context === "existing_data") {
      setDraft(null);
      setExplicitStructureAnswers(UNANSWERED_STRUCTURE);
      setFixtureCells(undefined);
      setFixtureGraphs(undefined);
      setStage("import");
      return;
    }
    setSelectedContext(context);
  };

  const selectEntryRoute = (route: ExperimentEntryRoute) => {
    if (!selectedContext) return;
    if (route.destination) {
      if (
        route.entryModuleId &&
        (route.destination === "survival" || route.destination === "nonlinear-fit") &&
        adaptiveInputFeatureEnabled() &&
        onDedicatedEntryReady
      ) {
        onDedicatedEntryReady(
          createDedicatedEntryIntent({
            moduleId: route.entryModuleId,
            destination: route.destination,
            sourceContext: selectedContext,
            entryRouteId: route.id,
            experimentName: route.title,
            experimentDescription: route.description,
          }),
        );
        return;
      }
      onNavigate(route.destination);
      return;
    }
    const nextDraft = createDraftForEntryRoute(selectedContext, route);
    setExplicitStructureAnswers(inferredStructureAnswersForRoute(route));
    setDraft(
      browserPreview
        ? {
            ...nextDraft,
            dataOrigin: "synthetic_demo",
            name: "ブラウザレビュー用の一時実験",
          }
        : nextDraft,
    );
    setFixtureCells(undefined);
    setFixtureGraphs(undefined);
    setDesignStep(0);
    setFurthestStep(0);
    setStage("design");
  };

  const goBackToContext = () => {
    setDraft(null);
    setExplicitStructureAnswers(UNANSWERED_STRUCTURE);
    setFixtureCells(undefined);
    setFixtureGraphs(undefined);
    setDesignStep(0);
    setFurthestStep(0);
    setStage("context");
    setSelectedContext(null);
    setCompatibilityEntryVisible(false);
  };

  const openDedicatedEntry = (
    moduleId: DedicatedEntryModuleId,
    destination: Extract<AppRoute, "survival" | "nonlinear-fit" | "heatmap">,
    entryRouteId: string,
    experimentName: string,
    experimentDescription: string,
  ) => {
    if (!onDedicatedEntryReady) return;
    recordUsageEntry(
      "new-experiment",
      moduleId === "time_to_event"
        ? "survival"
        : moduleId === "ordered_curve_kinetics"
          ? "ordered_curve"
          : "heatmap",
    );
    onDedicatedEntryReady(
      createDedicatedEntryIntent({
        moduleId,
        destination,
        sourceContext: "general_assay",
        entryRouteId,
        experimentName,
        experimentDescription,
      }),
    );
  };

  const canAdvance = () => {
    if (!draft) return false;
    if (designStep === 0) {
      return (
        draft.readouts.length > 0 &&
        draft.readouts.every(
          ({ label, shape, categories, referenceLabel }) =>
            Boolean(label.trim()) &&
            (shape !== "categorical_counts" || (categories?.length ?? 0) >= 2) &&
            (shape !== "wb_ratio" || Boolean(referenceLabel?.trim())),
        )
      );
    }
    if (designStep === 1) {
      return (
        activeConditions(draft).length >= (draft.analysisIntent.kind === "single_cohort" ? 1 : 2) &&
        (draft.analysisIntent.kind !== "single_cohort" ||
          draft.analysisIntent.mode === "descriptive" ||
          Number.isFinite(draft.analysisIntent.referenceValue)) &&
        (draft.entryRoute !== "protein_wb" ||
          structureAnswersAreComplete(draft, explicitStructureAnswers))
      );
    }
    if (designStep === 2)
      return (
        structureAnswersAreComplete(draft, explicitStructureAnswers) &&
        (draft.time.sampling === "none" ||
          (draft.time.points.length > 0 &&
            (orderedAxisSemantic(draft.time) === "time" || Boolean(draft.time.axisTitle?.trim()))))
      );
    return (
      draft.experiments.length > 0 &&
      draft.experiments.every((experiment) => experiment.date) &&
      (!(flowSteps.includes(2) || draft.entryRoute === "protein_wb") ||
        structureAnswersAreComplete(draft, explicitStructureAnswers))
    );
  };

  const designIsComplete = () => {
    if (!draft) return false;
    return (
      draft.readouts.length > 0 &&
      draft.readouts.every(
        ({ label, shape, categories, referenceLabel }) =>
          Boolean(label.trim()) &&
          (shape !== "categorical_counts" || (categories?.length ?? 0) >= 2) &&
          (shape !== "wb_ratio" || Boolean(referenceLabel?.trim())),
      ) &&
      activeConditions(draft).length >= (draft.analysisIntent.kind === "single_cohort" ? 1 : 2) &&
      (draft.analysisIntent.kind !== "single_cohort" ||
        draft.analysisIntent.mode === "descriptive" ||
        Number.isFinite(draft.analysisIntent.referenceValue)) &&
      (!(flowSteps.includes(2) || draft.entryRoute === "protein_wb") ||
        structureAnswersAreComplete(draft, explicitStructureAnswers)) &&
      (draft.time.sampling === "none" ||
        (draft.time.points.length > 0 &&
          (orderedAxisSemantic(draft.time) === "time" || Boolean(draft.time.axisTitle?.trim())))) &&
      draft.experiments.length > 0 &&
      draft.experiments.every((experiment) => experiment.date)
    );
  };

  const selectFlowStep = (step: FlowStep) => {
    if (step > furthestStep || (step === 4 && !designIsComplete())) return;
    recordBenchmarkEvent(step < designStep ? "design_backtracked" : "design_step_selected", {
      from: designStep,
      to: step,
    });
    if (step === 4) {
      setStage("confirmation");
      return;
    }
    setDesignStep(step);
    setStage("design");
  };

  const advance = () => {
    if (!canAdvance()) return;
    const currentIndex = flowSteps.indexOf(designStep);
    const nextStep = flowSteps[currentIndex + 1];
    if (nextStep !== undefined && nextStep !== 4) {
      setDesignStep(nextStep);
      setFurthestStep((current) => Math.max(current, nextStep) as FlowStep);
      return;
    }
    setFurthestStep(4);
    setStage("confirmation");
  };
  const recordWorkspaceStart = (workspaceDraft: ExperimentSetDraft, source: string) => {
    recordBenchmarkEvent("experiment_workspace_started", {
      source,
      context: workspaceDraft.context,
      entryRoute: workspaceDraft.entryRoute ?? "unspecified",
      timeSampling: workspaceDraft.time.sampling,
      orderedAxisSemantic: orderedAxisSemantic(workspaceDraft.time),
      orderedAxisTitle: orderedAxisTitle(workspaceDraft.time),
      orderedAxisUnit: orderedAxisUnit(workspaceDraft.time),
      unitStructure: workspaceDraft.conditionAssignment.kind,
      unitLabel: workspaceDraft.conditionAssignment.unitLabel,
      readout: workspaceDraft.readouts.map(({ shape }) => shape).join(","),
      conditionCount: workspaceDraft.conditions.length,
    });
    // Only typed workflow milestones leave this boundary. The draft, source label,
    // condition labels, and measurements are intentionally never sent to usage telemetry.
    recordUsageMilestone("new-experiment", "structure_ready");
  };

  if (stage === "workspace" && draft) {
    return (
      <Suspense
        fallback={
          <p className="app-route-loading" role="status">
            {localizedText(locale, "実験ワークスペースを読み込んでいます…", "Loading experiment workspace…")}
          </p>
        }
      >
        <ExperimentWorkspace
          rootRef={pageRootRef}
          initialDraft={withActiveConditions(draft)}
          initialCells={fixtureCells}
          initialGraphs={fixtureGraphs}
          analysisRunner={analysisRunner}
          analysisAvailable={analysisAvailable}
          saveProject={saveProject}
          favoriteGraphDefaults={favoriteGraphDefaults}
          onSaveFavorite={onSaveFavorite}
          onDirtyChange={onDirtyChange}
          onOpenProject={onOpenProject}
          onRequestExit={onRequestExit}
          onRegisterSaveHandler={onRegisterSaveHandler}
          fiveMinuteGuide={Boolean(initialFixture)}
          onBack={() => (fixtureCells ? goBackToContext() : setStage("confirmation"))}
        />
      </Suspense>
    );
  }

  return (
    <div className="page-stack narrow-page experiment-start" ref={pageRootRef}>
      {stage !== "graph-only" ? (
        <button
          className="back-link"
          type="button"
          onClick={(event) => {
            if (!acceptSingleClick(event.detail)) return;
            if (stage === "context") onNavigate("home");
            else
              requestEntryExit(
                localizedText(locale, "実験の種類を変更する", "change the experiment type"),
                goBackToContext,
              );
          }}
        >
          <span aria-hidden="true">←</span>{" "}
          {stage === "context"
            ? localizedText(locale, "ワークスペースに戻る", "Back to workspace")
            : localizedText(locale, "実験の種類を変更", "Change experiment type")}
        </button>
      ) : null}

      {stage === "context" && (
        <>
          {taskEntryHubEnabled && !compatibilityEntryVisible ? (
            <NewExperimentEntryHub
              onSimple={() => {
                setFixtureGraphs(undefined);
                enterStageFromHub("simple", "simple");
              }}
              onGeneral={() => {
                setBiologicalHandoffError(null);
                setFixtureGraphs(undefined);
                enterStageFromHub("general", "biological");
              }}
              onGraphOnly={() => {
                setPendingGraphOnlyState(null);
                setFixtureGraphs(undefined);
                enterStageFromHub("graphOnly", "graph-only");
              }}
              onSurvival={() =>
                openDedicatedEntry(
                  "time_to_event",
                  "survival",
                  "direct_time_to_event",
                  "生存時間",
                  "各対象のeventまたは観察終了までの期間を記録する実験",
                )
              }
              onOrderedCurve={() =>
                openDedicatedEntry(
                  "ordered_curve_kinetics",
                  "nonlinear-fit",
                  "direct_ordered_curve",
                  "濃度–反応・酵素反応",
                  "基質濃度–初速度、または時間–応答を記録し、対応するmodelを選んだ後だけfitする実験",
                )
              }
              onHeatmap={() =>
                openDedicatedEntry(
                  "matrix_visualization",
                  "heatmap",
                  "direct_heatmap",
                  "ヒートマップ",
                  "既存の数値行列を、その配置を保ったまま可視化する",
                )
              }
              onCompatibility={
                showCompatibilityEntry ? () => setCompatibilityEntryVisible(true) : undefined
              }
              availability={{
                graphOnly: {
                  available: unresolvedVisualizationEntryAvailable,
                  reason:
                    "この版ではGraph用の表を保存して再開できないため、データ入力前に停止しています。",
                },
                survival: {
                  available: Boolean(onDedicatedEntryReady) && dedicatedEntryAvailable,
                  reason:
                    onDedicatedEntryReady
                      ? "この版では入力途中の生存時間データを保存して再開できないため、データ入力前に停止しています。"
                      : "この版では生存時間の専用シートを安全に開けません。別の実験形式へは自動変換しません。",
                },
                orderedCurve: {
                  available: Boolean(onDedicatedEntryReady) && dedicatedEntryAvailable,
                  reason:
                    onDedicatedEntryReady
                      ? "この版では入力途中の濃度–反応・酵素反応データを保存して再開できないため、データ入力前に停止しています。"
                      : "この版では反応曲線の専用シートを安全に開けません。別の実験形式へは自動変換しません。",
                },
                heatmap: {
                  available:
                    Boolean(onDedicatedEntryReady) && unresolvedVisualizationEntryAvailable,
                  reason: onDedicatedEntryReady
                    ? "この版では行列とGraphを保存して再開できないため、データ入力前に停止しています。"
                    : "この版では行列を保つ専用シートを安全に開けません。別の実験形式へは自動変換しません。",
                },
              }}
            />
          ) : (
            <>
              <section className="experiment-start__intro" aria-labelledby="new-experiment-heading">
                <p className="experiment-start__eyebrow" role="status">
                  互換モード（以前の入力方式）
                </p>
                <h1 id="new-experiment-heading">何をした実験ですか？</h1>
                <p>
                  実験の背景を選び、短い質問に答えていくと、あなたの実験に合った入力シートにつながります。
                </p>
                <p className="experiment-start__subtle">
                  現在は以前の入力方式を表示しています。通常の入口とは異なり、実験分野から選びます。
                </p>
                <p className="experiment-start__subtle">
                  統計用語や解析名を先に選ぶ必要はありません。
                </p>
                {taskEntryHubEnabled ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setCompatibilityEntryVisible(false);
                      setSelectedContext(null);
                    }}
                  >
                    新しい入口へ戻る
                  </button>
                ) : null}
              </section>
              <ContextStart
                browserPreview={browserPreview}
                showDemos={!evaluationPreview}
                onSelect={selectContext}
                selectedContext={selectedContext}
                onRouteSelect={selectEntryRoute}
                onContextBack={() => setSelectedContext(null)}
                onDemoSelect={(fixture) => {
                  setDraft(fixture.draft);
                  setFixtureCells(fixture.cells);
                  setFixtureGraphs(undefined);
                  recordWorkspaceStart(fixture.draft, `synthetic_fixture:${fixture.id}`);
                  setStage("workspace");
                }}
                onSpecializedNavigate={onNavigate}
              />
              {taskEntryHubEnabled ? (
                <section className="experiment-start__specialized" aria-label="高度な互換入力">
                  <details>
                    <summary>高度な表構造を直接指定する</summary>
                    <p>検証中の技術入力画面です。通常は「実験から始める」を使用してください。</p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setStage("adaptive")}
                    >
                      技術入力画面を開く
                    </button>
                  </details>
                </section>
              ) : null}
            </>
          )}
        </>
      )}

      {stage === "biological" ? (
        <>
          <BiologicalExperimentSetup
            enabled={taskEntryHubEnabled}
            externalError={biologicalHandoffError}
            initial={
              pendingGraphOnlyState
                ? graphOnlyBiologicalInitial(pendingGraphOnlyState, locale)
                : undefined
            }
            onDirtyChange={(dirty) => updateEntryDirtySource("biological", dirty)}
            onCancel={() => {
              setBiologicalHandoffError(null);
              if (pendingGraphOnlyState) {
                updateEntryDirtySource("biological", false);
                setStage("graph-only");
              }
              else
                requestEntryExit(
                  localizedText(locale, "実験の種類を変更する", "change the experiment type"),
                  goBackToContext,
                );
            }}
            onReady={(result) => {
              try {
                const presentation = createBiologicalSetupPresentation(result);
                if (presentation.status === "stopped") {
                  recordUsageMilestone("new-experiment", "safe_stop");
                  setBiologicalHandoffError(biologicalHandoffStopMessage(locale, "presentation"));
                  return false;
                }
                const { contract } = result;
                const promoted = pendingGraphOnlyState
                  ? bridgeGraphOnlyTableToStatistics(pendingGraphOnlyState, contract)
                  : null;
                if (promoted?.status === "stopped") {
                  recordUsageMilestone("new-experiment", "safe_stop");
                  setBiologicalHandoffError(
                    biologicalHandoffStopMessage(locale, "table_promotion", promoted.reason),
                  );
                  return false;
                }
                const workspace = createAdaptiveWorkspace({
                  contract,
                  observations: promoted?.observations ?? [],
                  mapping: promoted?.mapping ?? null,
                  lineage: promoted?.lineage ?? null,
                  biologicalSetup: presentation.presentation,
                });
                if (workspace.status !== "ready" || !workspace.draft) {
                  recordUsageMilestone("new-experiment", "safe_stop");
                  setBiologicalHandoffError(
                    biologicalWorkspaceStopMessage(workspace.diagnostics, locale),
                  );
                  return false;
                }
                const reboundGraphs = pendingGraphOnlyState
                  ? rebindGraphOnlyGraphsToWorkspace({
                      state: pendingGraphOnlyState,
                      contract,
                      draft: workspace.draft,
                    })
                  : ({ status: "ready", graphs: [] } as const);
                if (reboundGraphs.status === "stopped") {
                  recordUsageMilestone("new-experiment", "safe_stop");
                  setBiologicalHandoffError(
                    biologicalHandoffStopMessage(locale, "graph_rebind", reboundGraphs.reason),
                  );
                  return false;
                }
                const promotedDraft = pendingGraphOnlyState
                  ? {
                      ...workspace.draft,
                      entrySourceHistory: createUnresolvedVisualizationPromotionHistory({
                        sourceState: pendingGraphOnlyState,
                        promotedWorkspaceGraphId: reboundGraphs.graphs[0]?.id ?? null,
                        capturedAt: new Date().toISOString(),
                      }),
                    }
                  : workspace.draft;
                setBiologicalHandoffError(null);
                setPendingGraphOnlyState(null);
                setDraft(promotedDraft);
                setFixtureCells(workspace.cells);
                setFixtureGraphs(reboundGraphs.graphs);
                recordWorkspaceStart(
                  promotedDraft,
                  promoted ? "graph_only_statistics_bridge" : "biological_experiment_setup_alpha",
                );
                clearEntryDirtyLifecycle();
                returnFocusEntryRef.current = null;
                setStage("workspace");
                return true;
              } catch {
                recordUsageMilestone("new-experiment", "safe_stop");
                setBiologicalHandoffError(biologicalHandoffStopMessage(locale, "unexpected"));
                return false;
              }
            }}
          />
        </>
      ) : null}

      {stage === "simple" ? (
        <SimpleGroupExperimentEntry
          onDirtyChange={(dirty) => updateEntryDirtySource("simple", dirty)}
          onBack={() =>
            requestEntryExit(
              localizedText(locale, "実験の種類を変更する", "change the experiment type"),
              goBackToContext,
            )
          }
          onReady={(simpleDraft) => {
            setDraft(simpleDraft);
            setFixtureCells(undefined);
            setFixtureGraphs(undefined);
            recordWorkspaceStart(simpleDraft, "simple_independent_groups");
            clearEntryDirtyLifecycle();
            returnFocusEntryRef.current = null;
            setStage("workspace");
          }}
        />
      ) : null}

      {stage === "adaptive" ? (
        <AdaptiveExperimentEntry
          locale={locale}
          onCancel={() => setStage("context")}
          onReady={(adaptiveDraft, adaptiveCells) => {
            setDraft(adaptiveDraft);
            setFixtureCells(adaptiveCells);
            setFixtureGraphs(undefined);
            recordWorkspaceStart(adaptiveDraft, "adaptive_input_alpha");
            setStage("workspace");
          }}
          onSurvivalReady={(text, snapshot) => {
            if (onAdaptiveSurvivalReady) onAdaptiveSurvivalReady(text, snapshot);
            else onNavigate("survival");
          }}
        />
      ) : null}

      {stage === "import" ? (
        <ExistingDataImport
          onReady={({ draft: importedDraft, cells }) => {
            setDraft(importedDraft);
            setFixtureCells(cells);
            setFixtureGraphs(undefined);
            recordWorkspaceStart(importedDraft, "existing_data_import");
            setStage("workspace");
          }}
        />
      ) : null}

      {stage === "graph-only" ? (
        <Suspense
          fallback={
            <p className="app-route-loading" role="status">
              {localizedText(locale, "Graph入力画面を読み込んでいます…", "Loading Graph input…")}
            </p>
          }
        >
          <GraphOnlyVisualizationPage
            onNavigate={onNavigate}
            onBack={() => {
              clearEntryDirtyLifecycle();
              setStage("context");
            }}
            saveProject={saveUnresolvedVisualizationProject}
            openProject={openUnresolvedVisualizationProject}
            initialState={pendingGraphOnlyState}
            initialTarget={initialGraphOnlyTarget}
            initialDirty={entryDirtySourcesRef.current.graphOnly}
            onDirtyChange={updateGraphOnlyDirty}
            onRequestExit={onRequestExit}
            onRegisterSaveHandler={onRegisterSaveHandler}
            onStatisticsStructureRequested={(state) => {
              setPendingGraphOnlyState(state);
              setBiologicalHandoffError(null);
              setStage("biological");
            }}
          />
        </Suspense>
      ) : null}

      {stage === "design" && draft && (
        <>
          <section
            className="experiment-start__intro experiment-start__intro--design"
            aria-labelledby="design-heading"
          >
            <div>
              <p className="experiment-start__eyebrow">
                {CONTEXT_LABELS[draft.context]} / 実験設計
              </p>
              <h1 id="design-heading">実験の内容を教えてください</h1>
            </div>
            <p>一度に一つだけ質問します。分からない項目は後から戻って修正できます。</p>
          </section>
          <Stepper
            activeStep={designStep}
            steps={flowSteps}
            furthestStep={furthestStep}
            confirmationEnabled={designIsComplete()}
            onSelect={selectFlowStep}
          />
          {designStep === 0 && <ReadoutStep draft={draft} onUpdate={updateDraft} />}
          {designStep === 1 && (
            <ConditionsStep
              draft={draft}
              onUpdate={updateDraft}
              explicitAnswers={explicitStructureAnswers}
              onExplicitAnswersUpdate={setExplicitStructureAnswers}
            />
          )}
          {designStep === 2 && (
            <TimeStep
              draft={draft}
              onUpdate={updateDraft}
              explicitAnswers={explicitStructureAnswers}
              onExplicitAnswersUpdate={setExplicitStructureAnswers}
            />
          )}
          {designStep === 3 && <ExperimentsStep draft={draft} onUpdate={updateDraft} />}
          <div className="experiment-start__form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={(event) => {
                if (!acceptSingleClick(event.detail)) return;
                if (designStep === flowSteps[0]) goBackToContext();
                else {
                  setDesignStep(
                    flowSteps[Math.max(0, flowSteps.indexOf(designStep) - 1)] as DesignStep,
                  );
                }
              }}
            >
              戻る
            </button>
            <button
              className="primary-button primary-button--ready"
              disabled={!canAdvance()}
              type="button"
              onClick={(event) => acceptSingleClick(event.detail) && advance()}
            >
              {designStep === 3 ? "設計を確認" : "次へ"}
            </button>
          </div>
        </>
      )}

      {stage === "confirmation" && draft && (
        <>
          <Stepper
            activeStep={4}
            steps={flowSteps}
            furthestStep={furthestStep}
            confirmationEnabled={designIsComplete()}
            onSelect={selectFlowStep}
          />
          <DesignConfirmation
            draft={withActiveConditions(draft)}
            canSave={Boolean(saveProject)}
            onEdit={() => {
              setDesignStep(0);
              setStage("design");
            }}
            onStart={() => {
              recordWorkspaceStart(withActiveConditions(draft), "design_wizard");
              setStage("workspace");
            }}
          />
        </>
      )}
    </div>
  );
}
