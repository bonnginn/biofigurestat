import {
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";

export type SyntheticFixture = Readonly<{
  id:
    | "simple_independent"
    | "independent_two_group"
    | "simple_independent_continuous"
    | "complex_proportion"
    | "nested_continuous"
    | "longitudinal"
    | "internal_alpha_core"
    | "paired_two_condition"
    | "xy_correlation"
    | "categorical_composition"
    | "multiple_readouts"
    | "wb_reference";
  title: string;
  description: string;
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
}>;

const experiments = [
  { id: "experiment.1", label: "Exp 1", date: "2026-07-03", note: "合成デモ・run A" },
  { id: "experiment.2", label: "Exp 2", date: "2026-07-10", note: "合成デモ・run B" },
  { id: "experiment.3", label: "Exp 3", date: "2026-07-18", note: "合成デモ・run C" },
] as const;

const time = {
  sampling: "cross_sectional" as const,
  unit: "h" as const,
  points: [
    { id: "time.0", value: 0 },
    { id: "time.24", value: 24 },
    { id: "time.48", value: 48 },
  ],
};

export function createIndependentTwoGroupFixture(): SyntheticFixture {
  const source = createSimpleIndependentContinuousFixture();
  const conditions = source.draft.conditions.slice(0, 2);
  const allowed = new Set(conditions.map(({ id }) => id));
  return {
    ...source,
    id: "independent_two_group",
    title: "独立2群（連続値）",
    description: "3実験回・2独立群の基本的な連続値デモです。",
    draft: {
      ...source.draft,
      name: "合成デモ：独立2群",
      conditions,
      controlConditionId: conditions[0]?.id,
    },
    cells: Object.fromEntries(
      Object.entries(source.cells).filter(([key]) =>
        [...allowed].some((conditionId) => key.includes(conditionId)),
      ),
    ),
  };
}

export function createSimpleIndependentFixture(): SyntheticFixture {
  const conditions = ["Control", "Treatment A", "Treatment B"].map((label, index) => ({
    id: `condition.simple.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：Simple 3群",
    readouts: [{ id: "readout.simple.proportion", label: "Marker X陽性率", shape: "proportion" }],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "proportion",
        positive: 24 + conditionIndex * 9 + experimentIndex * 2,
        eligible: 100,
      };
    });
  });
  return {
    id: "simple_independent",
    title: "Simple 3群",
    description: "3実験回・3条件の独立群。Simple Graphの幅と余白を確認します。",
    draft,
    cells,
  };
}

export function createSimpleIndependentContinuousFixture(): SyntheticFixture {
  const conditions = ["Control", "Treatment A", "Treatment B"].map((label, index) => ({
    id: `condition.simple.continuous.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：Simple 3群（連続値）",
    readouts: [
      {
        id: "readout.simple.continuous",
        label: "Fluorescence intensity",
        shape: "nested_continuous",
        unit: "a.u.",
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "dish" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const values = [
    [10, 15, 22],
    [12, 17, 25],
    [11, 16, 24],
  ] as const;
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "nested_continuous",
        source: "paste",
        rawValues: [values[experimentIndex]![conditionIndex]!],
      };
    });
  });
  return {
    id: "simple_independent_continuous",
    title: "Simple 3群（連続値）",
    description: "3実験回・3独立群の連続値。基本操作を短時間で確認できます。",
    draft,
    cells,
  };
}

export function createComplexProportionFixture(): SyntheticFixture {
  const attributes = [
    { id: "attribute.gene", label: "遺伝子" },
    { id: "attribute.sequence", label: "配列" },
    { id: "attribute.treatment", label: "処置" },
  ] as const;
  const rows = [
    ["Control", "—", "−"],
    ["Control", "—", "+"],
    ["Gene A", "#1", "−"],
    ["Gene A", "#1", "+"],
    ["Gene A", "#2", "−"],
    ["Gene A", "#2", "+"],
    ["Gene B（長いラベルの確認用）", "#1", "−"],
    ["Gene B（長いラベルの確認用）", "#1", "+"],
  ] as const;
  const conditions = rows.map(([gene, sequence, treatment], index) => ({
    id: `condition.demo.${index + 1}`,
    label: `${gene} / ${sequence} / ${treatment}`,
    attributes: {
      "attribute.gene": gene,
      "attribute.sequence": sequence,
      "attribute.treatment": treatment,
    },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：複雑な割合データ",
    readouts: [{ id: "readout.demo.proportion", label: "Marker X陽性率", shape: "proportion" }],
    attributes,
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time,
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      time.points.forEach((point, timeIndex) => {
        const key = experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
          timePointId: point.id,
        });
        if (experimentIndex === 1 && conditionIndex === 4 && timeIndex === 1) return;
        if (experimentIndex === 2 && conditionIndex === 7 && timeIndex === 0) {
          cells[key] = {
            kind: "proportion",
            positive: null,
            eligible: null,
            availability: "not_planned",
          };
          return;
        }
        const eligible = 92 + ((experimentIndex * 11 + conditionIndex * 7 + timeIndex * 5) % 19);
        const targetPercent = 18 + conditionIndex * 4.2 + timeIndex * 5.5 + experimentIndex * 1.8;
        cells[key] = {
          kind: "proportion",
          positive: Math.min(eligible, Math.round((eligible * targetPercent) / 100)),
          eligible,
        };
      });
    });
  });
  return {
    id: "complex_proportion",
    title: "複雑な割合データ",
    description: "3実験回・8条件・3時点。欠測、予定なし、長い階層ラベルを含みます。",
    draft,
    cells,
  };
}

function deterministicObservation(
  experimentIndex: number,
  conditionIndex: number,
  timeIndex: number,
  observationIndex: number,
): number {
  const center = 42 + experimentIndex * 2.4 + conditionIndex * 5.8 + timeIndex * 4.6;
  const wave =
    (((observationIndex * 17 + experimentIndex * 5 + conditionIndex * 3) % 23) - 11) * 0.72;
  const local = ((observationIndex % 5) - 2) * 0.31;
  return Number((center + wave + local).toFixed(2));
}

export function createNestedContinuousFixture(): SyntheticFixture {
  const attributes = [
    { id: "attribute.group", label: "群" },
    { id: "attribute.treatment", label: "処置" },
  ] as const;
  const rows = [
    ["Control", "−"],
    ["Control", "+"],
    ["Target（長い条件名の表示確認用）", "−"],
    ["Target（長い条件名の表示確認用）", "+"],
  ] as const;
  const conditions = rows.map(([group, treatment], index) => ({
    id: `condition.nested.${index + 1}`,
    label: `${group} / ${treatment}`,
    attributes: { "attribute.group": group, "attribute.treatment": treatment },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：細胞・ROIのネスト測定",
    readouts: [
      {
        id: "readout.demo.intensity",
        label: "蛍光強度",
        shape: "nested_continuous",
        unit: "a.u.",
      },
    ],
    attributes,
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time,
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      time.points.forEach((point, timeIndex) => {
        const key = experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
          timePointId: point.id,
        });
        if (experimentIndex === 1 && conditionIndex === 2 && timeIndex === 1) return;
        if (experimentIndex === 2 && conditionIndex === 3 && timeIndex === 0) {
          cells[key] = {
            kind: "nested_continuous",
            source: "manual",
            rawValues: [],
            availability: "not_planned",
          };
          return;
        }
        const count = 20 + ((experimentIndex * 7 + conditionIndex * 5 + timeIndex * 3) % 21);
        cells[key] = {
          kind: "nested_continuous",
          source: "paste",
          rawValues: Array.from({ length: count }, (_, observationIndex) =>
            deterministicObservation(experimentIndex, conditionIndex, timeIndex, observationIndex),
          ),
        };
      });
    });
  });
  return {
    id: "nested_continuous",
    title: "細胞・ROIのネスト測定",
    description: "3実験回・4条件・3時点。各セル20〜40観測で、観測数を意図的に変えています。",
    draft,
    cells,
  };
}

export function createLongitudinalFixture(): SyntheticFixture {
  const trackedExperiments = Array.from({ length: 4 }, (_, index) => ({
    id: `experiment.cell.${index + 1}`,
    label: `Cell ${index + 1}`,
    sessionId: "session.longitudinal.1",
    stableUnitId: `unit.cell.${index + 1}`,
    date: "2026-07-24",
    note: "合成デモ・同一Cellを追跡",
  }));
  const conditions = ["Control", "Stimulated"].map((label, index) => ({
    id: `condition.longitudinal.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const longitudinalTime = {
    sampling: "longitudinal" as const,
    unit: "h" as const,
    points: [0, 6, 12, 24].map((value) => ({ id: `time.${value}`, value })),
  };
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：同一Cellの経時追跡",
    readouts: [
      {
        id: "readout.longitudinal.intensity",
        label: "Reporter intensity",
        shape: "nested_continuous",
        unit: "a.u.",
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "matched", unitLabel: "細胞" },
    time: longitudinalTime,
    experiments: trackedExperiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  trackedExperiments.forEach((experiment, unitIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      longitudinalTime.points.forEach((point, timeIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
            timePointId: point.id,
          })
        ] = {
          kind: "nested_continuous",
          source: "manual",
          rawValues: [
            Number(
              (
                30 +
                unitIndex * 1.5 +
                conditionIndex * (3 + timeIndex * 2.2 + unitIndex * 0.4) +
                timeIndex
              ).toFixed(2),
            ),
          ],
        };
      });
    });
  });
  return {
    id: "longitudinal",
    title: "同一Cellの経時追跡",
    description: "4つの同一Cellを4時点で追跡する、縦断デザインの合成デモです。",
    draft,
    cells,
  };
}

export function createInternalAlphaCoreFixture(): SyntheticFixture {
  const units = Array.from({ length: 4 }, (_, index) => ({
    id: `experiment.alpha.${index + 1}`,
    label: `U${index + 1}`,
    sessionId: "session.internal-alpha.1",
    stableUnitId: `unit.internal-alpha.${index + 1}`,
    date: "2026-08-22",
    note: "合成デモ・保存再開確認",
  }));
  const conditions = ["Control", "Stimulated"].map((label, index) => ({
    id: `condition.alpha.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const alphaTime = {
    sampling: "longitudinal" as const,
    unit: "h" as const,
    points: [0, 8, 24, 48].map((value) => ({ id: `time.alpha.${value}`, value })),
  };
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：保存・再開確認",
    readouts: [
      { id: "readout.alpha.proportion", label: "Marker X陽性率", shape: "proportion" },
      {
        id: "readout.alpha.intensity",
        label: "Reporter intensity",
        shape: "nested_continuous",
        unit: "a.u.",
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "matched", unitLabel: "tracked unit" },
    time: alphaTime,
    experiments: units,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  units.forEach((experiment, unitIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      alphaTime.points.forEach((point, timeIndex) => {
        const common = {
          experimentId: experiment.id,
          conditionId: condition.id,
          timePointId: point.id,
        };
        cells[experimentCellKey({ ...common, readoutId: "readout.alpha.proportion" })] = {
          kind: "proportion",
          positive: 20 + unitIndex * 2 + conditionIndex * (8 + timeIndex * 4) + timeIndex * 2,
          eligible: 100,
        };
        cells[experimentCellKey({ ...common, readoutId: "readout.alpha.intensity" })] = {
          kind: "nested_continuous",
          source: "paste",
          rawValues: [
            Number((10 + unitIndex + timeIndex * 2 + conditionIndex * (3 + timeIndex)).toFixed(2)),
          ],
        };
      });
    });
  });
  return {
    id: "internal_alpha_core",
    title: "保存・再開の確認",
    description: "4安定単位・2条件・4時点・2測定項目。保存再開を短時間で確認します。",
    draft,
    cells,
  };
}

export function createMultipleReadoutFixture(): SyntheticFixture {
  const conditions = ["Control", "Treatment"].map((label, index) => ({
    id: `condition.multi.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：複数の測定項目",
    readouts: [
      { id: "readout.multi.proportion", label: "Marker X陽性率", shape: "proportion" },
      {
        id: "readout.multi.intensity",
        label: "蛍光強度",
        shape: "nested_continuous",
        unit: "a.u.",
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: "readout.multi.proportion",
        })
      ] = {
        kind: "proportion",
        positive: 25 + experimentIndex * 2 + conditionIndex * 15,
        eligible: 100,
      };
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: "readout.multi.intensity",
        })
      ] = {
        kind: "nested_continuous",
        source: "paste",
        rawValues: Array.from(
          { length: 8 + experimentIndex },
          (_, observationIndex) =>
            20 + conditionIndex * 8 + experimentIndex + observationIndex * 0.4,
        ),
      };
    });
  });
  return {
    id: "multiple_readouts",
    title: "複数の測定項目",
    description: "同じ実験セットに陽性率と蛍光強度を保持する合成デモです。",
    draft,
    cells,
  };
}

export function createPairedTwoConditionFixture(): SyntheticFixture {
  const pairedExperiments = Array.from({ length: 4 }, (_, index) => ({
    id: `experiment.animal.${index + 1}`,
    label: `Animal ${index + 1}`,
    sessionId: `session.paired.${index + 1}`,
    stableUnitId: `unit.animal.${index + 1}`,
    date: `2026-07-${String(3 + index * 4).padStart(2, "0")}`,
    note: "合成デモ・同じ個体を2条件で測定",
  }));
  const conditions = ["Before", "After"].map((label, index) => ({
    id: `condition.paired.${index + 1}`,
    label,
    attributes: { "attribute.phase": label },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "animal",
    entryRoute: "animal_numeric",
    name: "合成デモ：同じ個体の2条件比較",
    readouts: [{ id: "readout.paired.proportion", label: "Responder割合", shape: "proportion" }],
    attributes: [{ id: "attribute.phase", label: "条件" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "matched", unitLabel: "個体" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments: pairedExperiments,
  };
  const before = [28, 34, 31, 37];
  const after = [42, 39, 49, 45];
  const cells: Record<string, ExperimentCellMap[string]> = {};
  pairedExperiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "proportion",
        positive: (conditionIndex === 0 ? before : after)[experimentIndex] ?? null,
        eligible: 100,
      };
    });
  });
  return {
    id: "paired_two_condition",
    title: "同じ個体の2条件比較",
    description: "4個体をBefore/Afterで明示的に対応づけた合成デモです。",
    draft,
    cells,
  };
}

export function createXyCorrelationFixture(): SyntheticFixture {
  const xyExperiments = Array.from({ length: 6 }, (_, index) => ({
    id: `experiment.xy.${index + 1}`,
    label: `Sample ${index + 1}`,
    date: `2026-07-${String(2 + index * 3).padStart(2, "0")}`,
    note: "合成デモ・同じ試料のX–Yペア",
  }));
  const conditions = [
    {
      id: "condition.xy.x",
      label: "Cell area (µm²)",
      attributes: { "attribute.variable": "Cell area (µm²)" },
    },
    {
      id: "condition.xy.y",
      label: "Fluorescence intensity (a.u.)",
      attributes: { "attribute.variable": "Fluorescence intensity (a.u.)" },
    },
  ];
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：XとYの相関",
    readouts: [{ id: "readout.xy", label: "XとYの関係", shape: "nested_continuous" }],
    attributes: [{ id: "attribute.variable", label: "測定変数" }],
    conditions,
    analysisIntent: { kind: "correlation", relationshipForm: "linear" },
    conditionAssignment: { kind: "matched", unitLabel: "試料" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments: xyExperiments,
  };
  const xValues = [84, 102, 117, 139, 156, 173];
  const yValues = [21, 28, 32, 43, 46, 58];
  const cells: Record<string, ExperimentCellMap[string]> = {};
  xyExperiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      const value = (conditionIndex === 0 ? xValues : yValues)[experimentIndex];
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "nested_continuous",
        source: "manual",
        // One deliberately missing Y value exercises complete-pair filtering.
        rawValues: conditionIndex === 1 && experimentIndex === 4 ? [] : [value],
      };
    });
  });
  return {
    id: "xy_correlation",
    title: "XとYの相関",
    description: "同じ6試料のX–Yペアです。1組の片側欠測を含み、完全な組だけを解析します。",
    draft,
    cells,
  };
}

export function createCategoricalCompositionFixture(): SyntheticFixture {
  const conditions = ["Control", "Treatment"].map((label, index) => ({
    id: `condition.composition.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const categories = ["G0/G1", "S", "G2/M", "Other"].map((label, index) => ({
    id: `category.phase.${index + 1}`,
    label,
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "cell_culture",
    name: "合成デモ：カテゴリ構成",
    readouts: [
      {
        id: "readout.composition",
        label: "Cell-cycle composition",
        shape: "categorical_counts",
        categories,
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      const base = conditionIndex === 0 ? [55, 24, 19, 2] : [38, 34, 28, 0];
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "categorical_counts",
        counts: Object.fromEntries(
          categories.map((category, categoryIndex) => [
            category.id,
            base[categoryIndex] + (categoryIndex < 3 ? experimentIndex : 0),
          ]),
        ),
      };
    });
  });
  return {
    id: "categorical_composition",
    title: "カテゴリ構成",
    description:
      "G0/G1・S・G2/M・Otherのcountから構成割合を描く合成デモです。0 countも保持します。",
    draft,
    cells,
  };
}

export function createWbReferenceFixture(): SyntheticFixture {
  const conditions = ["Control", "Treatment"].map((label, index) => ({
    id: `condition.wb.${index + 1}`,
    label,
    attributes: { "attribute.group": label },
  }));
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "synthetic_demo",
    context: "protein_biochemical",
    name: "合成デモ：WB target/reference",
    readouts: [
      {
        id: "readout.wb.target",
        label: "Target protein",
        shape: "wb_ratio",
        unit: "ratio",
        referenceLabel: "GAPDH",
      },
    ],
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "サンプル" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      const reference = 28 + experimentIndex * 2 + conditionIndex;
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "wb_ratio",
        target:
          reference *
          (conditionIndex === 0 ? 1 + experimentIndex * 0.05 : 1.55 + experimentIndex * 0.07),
        reference,
      };
    });
  });
  return {
    id: "wb_reference",
    title: "WB target/reference",
    description: "3実験回・2条件。標的とGAPDHの生値から比を自動計算します。",
    draft,
    cells,
  };
}

export function syntheticFixtures(): readonly SyntheticFixture[] {
  return [
    createIndependentTwoGroupFixture(),
    createSimpleIndependentFixture(),
    createSimpleIndependentContinuousFixture(),
    createComplexProportionFixture(),
    createNestedContinuousFixture(),
    createLongitudinalFixture(),
    createInternalAlphaCoreFixture(),
    createPairedTwoConditionFixture(),
    createXyCorrelationFixture(),
    createCategoricalCompositionFixture(),
    createMultipleReadoutFixture(),
    createWbReferenceFixture(),
  ];
}
