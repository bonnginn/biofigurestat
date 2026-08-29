import type { ReadoutRepresentation, StructureContract } from "./contract.ts";

export const EXPERIMENT_CANVAS_VERSION = "0.2.0-prototype" as const;

export type CanvasCellStatus = "performed" | "not_performed_by_design" | "unknown";

export interface CanvasVariant {
  key: string;
  label: string;
  /** Legacy value-to-value hierarchy. Do not use it for a non-selectable group header. */
  parentValueKey: string | null;
  /** Optional non-selectable scientific/display group, for example siRNAs targeting Gene A. */
  groupKey?: string | null;
}

export interface CanvasValueGroup {
  key: string;
  label: string;
}

export interface CanvasDimension {
  key: string;
  label: string;
  kind: "intervention" | "inherent_property" | "ordered_quantity";
  groups?: CanvasValueGroup[];
  values: CanvasVariant[];
}

export interface CanvasConditionCell {
  key: string;
  values: Record<string, string>;
  status: CanvasCellStatus;
}

export interface CanvasReadout {
  key: string;
  label: string;
  representation: ReadoutRepresentation;
  componentLabels: string[];
}

/**
 * Researcher-editable experiment plan. It describes intended/performed condition combinations
 * and measurements, not the raw observation table and not biological independence.
 */
export interface ExperimentCanvas {
  schemaVersion: typeof EXPERIMENT_CANVAS_VERSION;
  experimentLabel: string;
  dimensions: CanvasDimension[];
  conditionCells: CanvasConditionCell[];
  readouts: CanvasReadout[];
}

export function validateExperimentCanvas(canvas: ExperimentCanvas): ExperimentCanvas {
  if (canvas.schemaVersion !== EXPERIMENT_CANVAS_VERSION) throw new Error("Unsupported experiment canvas version");
  if (!canvas.readouts.length) throw new Error("At least one measurement is required");

  const dimensions = new Map(canvas.dimensions.map((dimension) => [dimension.key, dimension]));
  if (dimensions.size !== canvas.dimensions.length) throw new Error("Canvas dimension keys must be unique");
  if (new Set(canvas.readouts.map((readout) => readout.key)).size !== canvas.readouts.length) {
    throw new Error("Canvas readout keys must be unique");
  }
  if (new Set(canvas.conditionCells.map((cell) => cell.key)).size !== canvas.conditionCells.length) {
    throw new Error("Canvas condition-cell keys must be unique");
  }

  for (const dimension of canvas.dimensions) {
    if (!dimension.values.length) throw new Error(`Canvas dimension has no values: ${dimension.label}`);
    const valueKeys = new Set(dimension.values.map((value) => value.key));
    const groups = dimension.groups ?? [];
    const groupKeys = new Set(groups.map((group) => group.key));
    if (groupKeys.size !== groups.length) throw new Error(`Duplicate groups in dimension: ${dimension.label}`);
    if (valueKeys.size !== dimension.values.length) throw new Error(`Duplicate values in dimension: ${dimension.label}`);
    for (const value of dimension.values) {
      if (value.parentValueKey !== null && !valueKeys.has(value.parentValueKey)) {
        throw new Error(`Unknown parent value in dimension: ${dimension.label}`);
      }
      if (value.groupKey && !groupKeys.has(value.groupKey)) throw new Error(`Unknown value group in dimension: ${dimension.label}`);
      if (value.parentValueKey !== null && value.groupKey) throw new Error(`A Canvas value cannot use both parentValueKey and groupKey: ${dimension.label}/${value.key}`);
    }
  }

  const conditionSignatures = new Set<string>();
  const orderedDimensionKeys = canvas.dimensions.map((dimension) => dimension.key);
  for (const cell of canvas.conditionCells) {
    if (Object.keys(cell.values).length !== orderedDimensionKeys.length || orderedDimensionKeys.some((key) => !(key in cell.values))) {
      throw new Error(`Condition cell must identify one value for every dimension: ${cell.key}`);
    }
    for (const [dimensionKey, valueKey] of Object.entries(cell.values)) {
      const dimension = dimensions.get(dimensionKey);
      if (!dimension) throw new Error(`Condition cell references unknown dimension: ${dimensionKey}`);
      if (!dimension.values.some((value) => value.key === valueKey)) {
        throw new Error(`Condition cell references unknown value: ${dimensionKey}/${valueKey}`);
      }
    }
    const signature = orderedDimensionKeys.map((key) => `${key}=${cell.values[key]}`).join("|");
    if (conditionSignatures.has(signature)) throw new Error(`Condition combination is duplicated: ${signature}`);
    conditionSignatures.add(signature);
  }

  return canvas;
}

function combinations(dimensions: CanvasDimension[]): Array<Record<string, string>> {
  return dimensions.reduce<Array<Record<string, string>>>(
    (rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.key]: value.key }))),
    [{}],
  );
}

/** Projection used only for expressiveness/regression checks from an already-complete contract. */
export function experimentCanvasFromContract(contract: StructureContract): ExperimentCanvas {
  const dimensions: CanvasDimension[] = contract.factors.map((factor) => ({
    key: factor.key,
    label: factor.label,
    kind: factor.ordered ? "ordered_quantity" : "intervention",
    groups: [],
    values: factor.levels.map((level) => ({ key: level, label: level, parentValueKey: null, groupKey: null })),
  }));
  const cells = combinations(dimensions);
  return validateExperimentCanvas({
    schemaVersion: EXPERIMENT_CANVAS_VERSION,
    experimentLabel: contract.caseId,
    dimensions,
    conditionCells: cells.map((values, index) => ({ key: `condition-${index + 1}`, values, status: "performed" })),
    readouts: contract.readouts.map((readout) => ({
      key: readout.key,
      label: readout.label,
      representation: readout.representation,
      componentLabels: readout.componentKeys,
    })),
  });
}
