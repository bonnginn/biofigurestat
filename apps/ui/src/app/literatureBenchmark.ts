import {
  conditionDisplayLabel,
  experimentCellKey,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
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
  observation_id?: string | null;
  condition: string;
  time: number | null;
  time_unit?: string | null;
  readout: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  x_value: number | null;
  event: string | null;
  missingness_state?: "observed" | "missing" | "not_planned";
  technical_replicate_id?: string | null;
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
    biological_question?: string | null;
    conditions: string;
    timepoints: string;
    readouts: string;
    experimental_unit_description: string;
    independent_session_count: number;
    repeated_identity_note: string;
    nested_observation_note: string;
    missingness_note?: string | null;
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
  return Boolean(caseId && /^(?:(?:JCB|NC|SA|EL)\d{3}|LSA\d{3})$/.test(caseId));
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

function sourceAxisValues(source: LiteratureExperimenterCase): number[] {
  const xValues = uniqueInOrder(
    source.syntheticData
      .map(({ x_value }) => x_value)
      .filter((value): value is number => value !== null),
  );
  if (xValues.length) return xValues;
  return uniqueInOrder(
    source.syntheticData.map(({ time }) => time).filter((value): value is number => value !== null),
  );
}

export function literatureOrderedAxisSummary(source: LiteratureExperimenterCase): string | null {
  const axis = structuredXAxis(source);
  if (!axis || axis.semantic !== "numeric_covariate") return null;
  const values = sourceAxisValues(source);
  return `Numeric axis: ${axis.title}${axis.unit ? ` (${axis.unit})` : " (unitless)"}; levels: ${values.join(", ")}. Do not enter this axis as time.`;
}

export function literatureWorkflowSummary(source: LiteratureExperimenterCase): string | null {
  const rows = source.syntheticData;
  if (rows.length && rows.every(({ x_value }) => x_value !== null)) {
    return "Workflow: paired X/Y relationship. Use the 2-measurement relationship route; each x_value and value belongs to the same stable unit.";
  }
  const conditions = uniqueInOrder(rows.map(({ condition }) => condition));
  const factorialCells = conditions.map((condition) =>
    condition.split("|").map((part) => part.trim()),
  );
  if (
    factorialCells.length >= 4 &&
    factorialCells.every((parts) => parts.length === 2 && parts.every(Boolean)) &&
    uniqueInOrder(factorialCells.map(([first]) => first)).length >= 2 &&
    uniqueInOrder(factorialCells.map(([, second]) => second)).length >= 2
  ) {
    return "Workflow: two-factor independent design. Preserve the two condition components as separate factors and evaluate their interaction; do not flatten the cells into a one-way group list.";
  }
  if (rows.length && rows.every(({ event, time }) => event !== null && time !== null)) {
    return "Workflow: Survival / time-to-event. Preserve event/censoring status and use the Survival route.";
  }
  return null;
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
  if (
    rows.some(
      (row) =>
        row.value === null || (row.missingness_state && row.missingness_state !== "observed"),
    )
  ) {
    return mismatch(
      "欠測または未計画観測のidentityを安全に保持する必要があるため、現在のliterature loaderでは自動入力しません。対応状況だけ記録してください。",
    );
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
  const sourceFactorCells = sourceConditions.map((condition) =>
    condition.split("|").map((part) => part.trim()),
  );
  const factorialSource =
    sourceFactorCells.length >= 4 &&
    sourceFactorCells.every((parts) => parts.length === 2 && parts.every(Boolean)) &&
    uniqueInOrder(sourceFactorCells.map(([first]) => first)).length >= 2 &&
    uniqueInOrder(sourceFactorCells.map(([, second]) => second)).length >= 2;
  const sourceTimes = uniqueInOrder(
    rows.map((row) => row.time).filter((value): value is number => value !== null),
  );
  const sourceReadouts = uniqueInOrder(rows.map((row) => row.readout));
  const correlationPairs =
    sourceConditions.length === 1 &&
    sourceReadouts.length === 1 &&
    rows.every((row) => row.x_value !== null);
  if (correlationPairs) {
    if (
      target.analysisIntent.kind !== "correlation" ||
      target.readouts.length !== 1 ||
      target.readouts[0]?.shape !== "nested_continuous" ||
      target.conditions.length !== 2 ||
      target.conditionAssignment.kind !== "matched" ||
      target.time.sampling !== "none"
    ) {
      return mismatch(
        "x_valueとvalueは同じ実験単位のX/Yペアです。「2つの測定値の関係」を選び、対応するX/Yの2列として設計してください。",
      );
    }
    const units = uniqueInOrder(rows.map((row) => sourceUnit(row)));
    if (target.experiments.length !== units.length) {
      return mismatch(`X/Yがそろった統計上の実験単位を${units.length}個作成してください。`);
    }
    const cells: Record<string, ExperimentCellMap[string]> = {};
    rows.forEach((row) => {
      const experiment = target.experiments[units.indexOf(sourceUnit(row))];
      const readout = target.readouts[0];
      if (!experiment || !readout) return;
      [row.x_value, row.value].forEach((value, conditionIndex) => {
        const condition = target.conditions[conditionIndex];
        if (!condition) return;
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
          })
        ] = {
          kind: "nested_continuous",
          source: "paste",
          rawValues: [value as number],
          sourceLocations: [
            `${source.caseId}:${row.experiment_id}:${row.unit_id}:${conditionIndex === 0 ? "x_value" : row.readout}`,
          ],
        };
      });
    });
    return {
      compatible: true,
      reason: `${source.caseId}の${rows.length}組のsynthetic X/Y値を、同じ安定IDのペアとして対応づけます。`,
      cells,
    };
  }
  const hasRatios = rows.some((row) => row.numerator !== null || row.denominator !== null);
  const isWbTarget = (readout: string) =>
    /(?:^|_)(?:target)(?:_|$)/i.test(readout) && !/(?:ratio|normalized)/i.test(readout);
  const isWbReference = (readout: string) => /(?:reference|loading_control)/i.test(readout);
  const isWbRatio = (readout: string) => /(?:ratio|normalized_target)/i.test(readout);
  const hasWbBands =
    sourceReadouts.some(isWbTarget) &&
    sourceReadouts.some(isWbReference) &&
    sourceReadouts.some(isWbRatio);
  const expectedShape = hasRatios ? "proportion" : hasWbBands ? "wb_ratio" : "nested_continuous";
  if (hasWbBands) {
    const rowsByUnit = new Map<string, LiteratureSyntheticRow[]>();
    rows.forEach((row) => {
      const key = `${row.condition}\u0000${sourceUnit(row)}`;
      rowsByUnit.set(key, [...(rowsByUnit.get(key) ?? []), row]);
    });
    for (const unitRows of rowsByUnit.values()) {
      const targetRow = unitRows.find((row) => isWbTarget(row.readout));
      const referenceRow = unitRows.find((row) => isWbReference(row.readout));
      const ratioRow = unitRows.find((row) => isWbRatio(row.readout));
      if (!targetRow || !referenceRow || !ratioRow || !referenceRow.value) {
        return mismatch(
          "WBの各実験単位にtarget・loading reference・normalized ratioの完全なlineageが必要です。",
        );
      }
      const derivedRatio = (targetRow.value as number) / referenceRow.value;
      if (Math.abs(derivedRatio - (ratioRow.value as number)) > 0.02) {
        return mismatch("WBの保存済みnormalized ratioがtarget/reference lineageと一致しません。");
      }
    }
  }
  const linkedMultiReadout = sourceReadouts.length > 1 && !hasWbBands;
  if (linkedMultiReadout) {
    if (hasRatios) {
      return mismatch(
        "複数readoutと割合入力が混在しているため、安全なlinked-readout loaderでは自動入力しません。",
      );
    }
    const rowsByUnitAndAxis = new Map<string, LiteratureSyntheticRow[]>();
    rows.forEach((row) => {
      const key = JSON.stringify([row.condition, row.time, row.x_value, sourceUnit(row)]);
      rowsByUnitAndAxis.set(key, [...(rowsByUnitAndAxis.get(key) ?? []), row]);
    });
    for (const unitRows of rowsByUnitAndAxis.values()) {
      const observedReadouts = unitRows.map((row) => row.readout);
      if (
        observedReadouts.length !== sourceReadouts.length ||
        new Set(observedReadouts).size !== observedReadouts.length ||
        sourceReadouts.some((readout) => !observedReadouts.includes(readout))
      ) {
        return mismatch(
          "各実験単位・測定軸水準には、重複のない同じreadout一式が必要です。不完全または曖昧なlinked readoutは自動入力しません。",
        );
      }
    }
    if (
      target.readouts.length !== sourceReadouts.length ||
      target.readouts.some(
        (readout, index) =>
          readout.shape !== "nested_continuous" ||
          normalized(readout.label) !== normalized(sourceReadouts[index] ?? ""),
      )
    ) {
      return mismatch(
        `測定項目をこの順序・名前で作成してください：${sourceReadouts.join("、")}。すべて強度・サイズ・形態の数値として保持します。`,
      );
    }
  } else if (target.readouts.length !== 1 || target.readouts[0]?.shape !== expectedShape) {
    return mismatch(`測定項目を${expectedShape}の1項目にしてください。`);
  }
  if (target.conditions.length !== sourceConditions.length) {
    return mismatch(`条件数を${sourceConditions.length}にしてください。`);
  }
  if (factorialSource && target.attributes.length !== 2) {
    return mismatch(
      "このcaseは区切られた2要因の全組合せです。2つの要因を別々に定義し、interactionを評価するfactorial designにしてください。",
    );
  }
  const targetConditionLabels = target.conditions.map((condition) =>
    normalized(conditionDisplayLabel(condition, target.attributes) || condition.label),
  );
  if (
    sourceConditions.some((condition, index) => {
      if (!factorialSource) return normalized(condition) !== targetConditionLabels[index];
      const targetCondition = target.conditions[index];
      const sourceParts = sourceFactorCells[index];
      const targetParts = target.attributes.map(
        (attribute) => targetCondition?.attributes[attribute.id] ?? "",
      );
      return sourceParts.some(
        (part, partIndex) => normalized(part) !== normalized(targetParts[partIndex] ?? ""),
      );
    })
  ) {
    return mismatch(`条件をこの順序で作成してください：${sourceConditions.join("、")}`);
  }

  const conditionsByRawUnit = new Map<string, Set<string>>();
  for (const row of rows) {
    const conditions = conditionsByRawUnit.get(row.unit_id) ?? new Set<string>();
    conditions.add(row.condition);
    conditionsByRawUnit.set(row.unit_id, conditions);
  }
  const matched =
    [...conditionsByRawUnit.values()].some((conditions) => conditions.size > 1) ||
    /across (?:paired|multiple) conditions/i.test(source.researcherPacket.repeated_identity_note);
  if (target.conditionAssignment.kind !== (matched ? "matched" : "independent")) {
    return mismatch(
      matched
        ? "同じ安定した実験単位を条件間で測る設計にしてください。"
        : "条件ごとに別々の実験単位を用いる設計にしてください。",
    );
  }
  const expectedAxis = structuredXAxis(source);
  const usesSyntheticXValues = rows.some(({ x_value }) => x_value !== null);
  const axisValues =
    expectedAxis?.semantic === "numeric_covariate" ? sourceAxisValues(source) : sourceTimes;
  const rowAxisValue = (row: LiteratureSyntheticRow): number | null =>
    expectedAxis?.semantic === "numeric_covariate" && row.x_value !== null ? row.x_value : row.time;
  const unitAxisValues = new Map<string, Set<number>>();
  for (const row of rows) {
    const axisValue = rowAxisValue(row);
    if (axisValue === null) continue;
    const unit = `${row.condition}:${sourceUnit(row)}`;
    const seen = unitAxisValues.get(unit) ?? new Set<number>();
    seen.add(axisValue);
    unitAxisValues.set(unit, seen);
  }
  const expectedSampling =
    axisValues.length === 0
      ? "none"
      : [...unitAxisValues.values()].some((values) => values.size > 1)
        ? "longitudinal"
        : "cross_sectional";
  if (
    target.time.sampling !== expectedSampling ||
    target.time.points.length !== axisValues.length ||
    target.time.points.some((point, index) => point.value !== axisValues[index])
  ) {
    return mismatch(
      expectedAxis?.semantic === "numeric_covariate"
        ? `数値軸の測定構造を${expectedSampling}、水準 ${axisValues.join("、")}にしてください。`
        : `時間構造を${expectedSampling}、時点 ${sourceTimes.length ? sourceTimes.join("、") : "なし"}にしてください。`,
    );
  }
  if (
    expectedAxis &&
    (orderedAxisSemantic(target.time) !== expectedAxis.semantic ||
      orderedAxisTitle(target.time) !== expectedAxis.title ||
      orderedAxisUnit(target.time) !== expectedAxis.unit)
  ) {
    return mismatch(
      expectedAxis.semantic === "numeric_covariate"
        ? `測定軸を「時間以外の数値軸」、名前を${expectedAxis.title}、単位を${expectedAxis.unit || "空欄"}にしてください。時間として入力しません。`
        : `測定軸を${expectedAxis.title} (${expectedAxis.unit})にしてください。`,
    );
  }

  const cellGroups = new Map<string, Map<string, LiteratureSyntheticRow[]>>();
  for (const row of rows) {
    const groupKey = JSON.stringify([
      row.condition,
      rowAxisValue(row),
      hasWbBands ? "normalized_target_ratio" : row.readout,
    ]);
    const units = cellGroups.get(groupKey) ?? new Map<string, LiteratureSyntheticRow[]>();
    const unit = sourceUnit(row);
    units.set(unit, [...(units.get(unit) ?? []), row]);
    cellGroups.set(groupKey, units);
  }
  const unitOrderByCondition = new Map<string, string[]>();
  for (const row of rows) {
    const units = unitOrderByCondition.get(row.condition) ?? [];
    const unit = sourceUnit(row);
    if (!units.includes(unit)) units.push(unit);
    unitOrderByCondition.set(row.condition, units);
  }
  const matchedUnitOrder = matched ? uniqueInOrder(rows.map((row) => sourceUnit(row))) : [];
  const expectedExperimentCount = matched
    ? matchedUnitOrder.length
    : usesSyntheticXValues
      ? Math.max(...[...unitOrderByCondition.values()].map((units) => units.length))
      : Math.max(...[...cellGroups.values()].map((units) => units.size));
  if (target.experiments.length !== expectedExperimentCount) {
    return mismatch(`統計上の実験単位を${expectedExperimentCount}個作成してください。`);
  }

  const cells: Record<string, ExperimentCellMap[string]> = {};
  for (const [groupKey, units] of cellGroups) {
    const [conditionLabel, axisValue, readoutLabel] = JSON.parse(groupKey) as [
      string,
      number | null,
      string,
    ];
    const conditionIndex = sourceConditions.indexOf(conditionLabel);
    const targetCondition = target.conditions[conditionIndex];
    const axisIndex = axisValue === null ? -1 : axisValues.indexOf(axisValue);
    const targetTime = axisIndex < 0 ? undefined : target.time.points[axisIndex];
    const targetReadout = hasWbBands
      ? target.readouts[0]
      : target.readouts[sourceReadouts.indexOf(readoutLabel)];
    if (!targetCondition || !targetReadout) return mismatch("Target design mapping failed.");
    [...units.entries()].forEach(([unit, unitRows], groupExperimentIndex) => {
      const experimentIndex = matched
        ? matchedUnitOrder.indexOf(unit)
        : (unitOrderByCondition.get(conditionLabel)?.indexOf(unit) ?? groupExperimentIndex);
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
      } else if (expectedShape === "wb_ratio") {
        const targetRow = unitRows.find((row) => isWbTarget(row.readout));
        const referenceRow = unitRows.find((row) => isWbReference(row.readout));
        if (!targetRow || !referenceRow) return;
        cells[key] = {
          kind: "wb_ratio",
          target: targetRow.value,
          reference: referenceRow.value,
          inputMode: "corrected_value",
        };
      } else if (expectedShape === "nested_continuous") {
        cells[key] = {
          kind: "nested_continuous",
          source: "paste",
          rawValues: unitRows.map((row) => row.value as number),
          sourceLocations: unitRows.map(
            (row) =>
              `${source.caseId}:${row.experiment_id}:${row.unit_id}:${readoutLabel}:${row.observation_id ?? "observation"}`,
          ),
        };
      }
    });
  }
  return {
    compatible: true,
    reason: linkedMultiReadout
      ? `${source.caseId}の${rows.length} synthetic rowsを、実験単位と${sourceReadouts.length} readoutsのidentityを分離したまま対応づけます。biological nはreadout数で増やしません。`
      : `${source.caseId}の${rows.length} synthetic rowsを、確認済みの条件・時間・実験単位へ対応づけます。`,
    cells,
    ...(structuredXAxis(source) ? { xAxis: structuredXAxis(source) } : {}),
  };
}
