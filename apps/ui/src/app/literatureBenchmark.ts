import {
  conditionDisplayLabel,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";
import type { BenchmarkIdentity } from "./benchmarkEvaluation";
import { evaluationMode, evaluationModeIsConfigured } from "./evaluationMode";

export type LiteratureSyntheticRow = Readonly<{
  case_id: string;
  experiment_id: string;
  unit_id: string;
  parent_unit_id: string | null;
  condition: string;
  time: number | null;
  readout: string;
  value: number;
  numerator: number | null;
  denominator: number | null;
  x_value: number | null;
  event: string | null;
  synthetic: true;
  seed: number;
}>;

export type LiteratureExperimenterCase = Readonly<{
  benchmarkVersion: string;
  caseId: string;
  sourceViewSha256?: string;
  researcherPacket: Readonly<{
    case_id: string;
    blind_experiment_summary: string;
    measurement_context: string;
    conditions: string;
    timepoints: string;
    readouts: string;
    experimental_unit_description: string;
    independent_session_count: number;
    repeated_identity_note: string;
    nested_observation_note: string;
  }>;
  paperReference?: Readonly<{
    title: string;
    doi: string;
    article_url: string;
    target_figure_or_panel: string;
    paper_reported_analysis: string;
    curated_graph_reference: string;
  }>;
  syntheticData: readonly LiteratureSyntheticRow[];
}>;

export type LiteratureLoadAssessment = Readonly<{
  compatible: boolean;
  reason: string;
  cells: ExperimentCellMap;
  xAxis?: Readonly<{
    semantic: "time" | "numeric_covariate" | "categorical";
    title: string;
    unit: string;
    source: "researcher_packet" | "synthetic_x_value";
  }>;
}>;

export function isLiteratureCaseId(caseId: string | undefined): boolean {
  return Boolean(caseId && /^(?:JCB|NC|SA|EL)\d{3}$/.test(caseId));
}

export async function fetchLiteratureExperimenterCase(
  identity: BenchmarkIdentity,
): Promise<LiteratureExperimenterCase> {
  if (!evaluationModeIsConfigured(evaluationMode) || !isLiteratureCaseId(identity.caseId)) {
    throw new Error("Literature benchmark case is not configured");
  }
  const query = new URLSearchParams({
    caseId: identity.caseId,
    track: identity.track,
    runId: identity.runId,
  });
  const response = await fetch(`${evaluationMode.apiBasePath}/literature/case?${query}`);
  if (!response.ok) throw new Error("Literature benchmark case could not be loaded");
  return (await response.json()) as LiteratureExperimenterCase;
}

function uniqueInOrder<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function sourceUnit(row: LiteratureSyntheticRow): string {
  return row.parent_unit_id ?? row.unit_id;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function structuredXAxis(source: LiteratureExperimenterCase): LiteratureLoadAssessment["xAxis"] {
  const packetAxisText = [
    source.researcherPacket.blind_experiment_summary,
    source.researcherPacket.experimental_unit_description,
    source.researcherPacket.measurement_context,
  ].join(" ");
  if (/radius-dependent|sholl\s+(?:intersection\s+)?radius/i.test(packetAxisText)) {
    return {
      semantic: "numeric_covariate",
      title: "Radius",
      unit: "µm",
      source: "researcher_packet",
    };
  }
  if (source.syntheticData.some(({ x_value }) => x_value !== null)) {
    return {
      semantic: "numeric_covariate",
      title: "Covariate",
      unit: "",
      source: "synthetic_x_value",
    };
  }
  return source.syntheticData.some(({ time }) => time !== null)
    ? { semantic: "time", title: "Time", unit: "h", source: "researcher_packet" }
    : undefined;
}

export function mapLiteratureMeasurements(
  source: LiteratureExperimenterCase,
  target: ExperimentSetDraft,
): LiteratureLoadAssessment {
  const mismatch = (reason: string): LiteratureLoadAssessment => ({
    compatible: false,
    reason,
    cells: {},
  });
  const rows = source.syntheticData;
  if (!rows.length || rows.some((row) => row.case_id !== source.caseId || row.synthetic !== true)) {
    return mismatch("Runtimeのcase identityまたはsynthetic flagが一致しません。");
  }
  const packetDeclaresNestedObservations =
    /(?:cell|lower-level)-level observations are nested/i.test(
      source.researcherPacket.nested_observation_note,
    );
  if (packetDeclaresNestedObservations && rows.some((row) => !row.parent_unit_id)) {
    return mismatch(
      "Researcher Packetは下位観測のnestingを宣言していますが、runtime rowにparent unitがありません。",
    );
  }
  const sourceConditions = uniqueInOrder(rows.map((row) => row.condition));
  const sourceTimes = uniqueInOrder(
    rows.map((row) => row.time).filter((value): value is number => value !== null),
  );
  const sourceReadouts = uniqueInOrder(rows.map((row) => row.readout));
  const hasRatios = rows.some((row) => row.numerator !== null || row.denominator !== null);
  const hasWbBands = sourceReadouts.some((readout) =>
    /target_raw|reference_raw|target_ratio/.test(readout),
  );
  const expectedShape = hasRatios ? "proportion" : hasWbBands ? "wb_ratio" : "nested_continuous";
  if (hasWbBands) {
    return mismatch(
      "WB source rowsはtarget/reference lineageを持つため、現在の安全なliterature loaderでは自動入力しません。対応状況だけ記録してください。",
    );
  }
  if (sourceReadouts.length !== 1 && !hasWbBands) {
    return mismatch(
      `このcaseは${sourceReadouts.length} readoutsを持ち、現在の安全なliterature loaderでは自動入力しません。対応状況だけ記録してください。`,
    );
  }
  if (target.readouts.length !== 1 || target.readouts[0]?.shape !== expectedShape) {
    return mismatch(`測定項目を${expectedShape}の1項目にしてください。`);
  }
  if (target.conditions.length !== sourceConditions.length) {
    return mismatch(`条件数を${sourceConditions.length}にしてください。`);
  }
  const targetConditionLabels = target.conditions.map((condition) =>
    normalized(conditionDisplayLabel(condition, target.attributes) || condition.label),
  );
  if (
    sourceConditions.some(
      (condition, index) => normalized(condition) !== targetConditionLabels[index],
    )
  ) {
    return mismatch(`条件をこの順序で作成してください：${sourceConditions.join("、")}`);
  }

  const matched = /across (?:paired|multiple) conditions/i.test(
    source.researcherPacket.repeated_identity_note,
  );
  if (target.conditionAssignment.kind !== (matched ? "matched" : "independent")) {
    return mismatch(
      matched
        ? "同じ安定した実験単位を条件間で測る設計にしてください。"
        : "条件ごとに別々の実験単位を用いる設計にしてください。",
    );
  }
  const unitTimes = new Map<string, Set<number>>();
  for (const row of rows) {
    if (row.time === null) continue;
    const unit = `${row.condition}:${sourceUnit(row)}`;
    const seen = unitTimes.get(unit) ?? new Set<number>();
    seen.add(row.time);
    unitTimes.set(unit, seen);
  }
  const expectedSampling =
    sourceTimes.length === 0
      ? "none"
      : [...unitTimes.values()].some((times) => times.size > 1)
        ? "longitudinal"
        : "cross_sectional";
  if (
    target.time.sampling !== expectedSampling ||
    target.time.points.length !== sourceTimes.length ||
    target.time.points.some((point, index) => point.value !== sourceTimes[index])
  ) {
    return mismatch(
      `時間構造を${expectedSampling}、時点 ${sourceTimes.length ? sourceTimes.join("、") : "なし"}にしてください。`,
    );
  }

  const cellGroups = new Map<string, Map<string, LiteratureSyntheticRow[]>>();
  for (const row of rows) {
    const groupKey = JSON.stringify([row.condition, row.time, row.readout]);
    const units = cellGroups.get(groupKey) ?? new Map<string, LiteratureSyntheticRow[]>();
    const unit = sourceUnit(row);
    units.set(unit, [...(units.get(unit) ?? []), row]);
    cellGroups.set(groupKey, units);
  }
  const expectedExperimentCount = Math.max(...[...cellGroups.values()].map((units) => units.size));
  if (target.experiments.length !== expectedExperimentCount) {
    return mismatch(`統計上の実験単位を${expectedExperimentCount}個作成してください。`);
  }

  const cells: Record<string, ExperimentCellMap[string]> = {};
  for (const [groupKey, units] of cellGroups) {
    const [conditionLabel, timeValue, readoutLabel] = JSON.parse(groupKey) as [
      string,
      number | null,
      string,
    ];
    const conditionIndex = sourceConditions.indexOf(conditionLabel);
    const targetCondition = target.conditions[conditionIndex];
    const timeIndex = timeValue === null ? -1 : sourceTimes.indexOf(timeValue);
    const targetTime = timeIndex < 0 ? undefined : target.time.points[timeIndex];
    const targetReadout = target.readouts[0];
    if (!targetCondition || !targetReadout) return mismatch("Target design mapping failed.");
    [...units.values()].forEach((unitRows, experimentIndex) => {
      const targetExperiment = target.experiments[experimentIndex];
      if (!targetExperiment) return;
      const key = experimentCellKey({
        experimentId: targetExperiment.id,
        conditionId: targetCondition.id,
        readoutId: targetReadout.id,
        timePointId: targetTime?.id,
      });
      if (expectedShape === "proportion") {
        const row = unitRows[0];
        cells[key] = {
          kind: "proportion",
          positive: row?.numerator ?? null,
          eligible: row?.denominator ?? null,
        };
      } else if (expectedShape === "nested_continuous") {
        cells[key] = {
          kind: "nested_continuous",
          source: "paste",
          rawValues: unitRows.map((row) => row.value),
          sourceLocations: unitRows.map(
            (row) => `${source.caseId}:${row.experiment_id}:${row.unit_id}:${readoutLabel}`,
          ),
        };
      }
    });
  }
  return {
    compatible: true,
    reason: `${source.caseId}の${rows.length} synthetic rowsを、確認済みの条件・時間・実験単位へ対応づけます。`,
    cells,
    ...(structuredXAxis(source) ? { xAxis: structuredXAxis(source) } : {}),
  };
}
