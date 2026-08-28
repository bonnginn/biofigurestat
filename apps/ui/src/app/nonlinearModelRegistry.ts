export type NonlinearModelId =
  "zero_baseline_association" | "one_phase_association" | "michaelis_menten";

export type NonlinearParameterId = "baseline" | "plateau" | "rate" | "vmax" | "km";

export type NonlinearModelDefinition = Readonly<{
  id: NonlinearModelId;
  label: string;
  shortDescription: string;
  formula: string;
  parameters: readonly NonlinearParameterId[];
  parameterLabels: Readonly<Partial<Record<NonlinearParameterId, string>>>;
  defaultRationale: string;
  suggestedXLabel: string;
  suggestedYLabel: string;
  examplePaste: string;
  xUnitExample: string;
  yUnitExample: string;
  requiresAxisUnits: boolean;
  templateVersion: "0.1.0" | "0.2.0";
  recommendationReasonCode: string;
}>;

export const DEFAULT_NONLINEAR_MODEL_ID: NonlinearModelId = "zero_baseline_association";

export const NONLINEAR_MODEL_DEFINITIONS: readonly NonlinearModelDefinition[] = [
  {
    id: "zero_baseline_association",
    label: "Zero-baseline association",
    shortDescription: "開始値を0に固定した、時間などに対する単調な飽和過程",
    formula: "Y = plateau × (1 − exp(−rate × X))",
    parameters: ["plateau", "rate"],
    parameterLabels: { plateau: "plateau", rate: "rate" },
    defaultRationale:
      "反応時間に対する単調な飽和過程で、開始時点が0に固定されるため、最小のzero-baseline association modelを選択しました。",
    suggestedXLabel: "Time",
    suggestedYLabel: "Response",
    examplePaste:
      "Unit ID\tSeries\tX\tY\nK5.r1\tK5\t0\t0\nK5.r1\tK5\t15\t0.55\nK5.r1\tK5\t30\t0.95\nK5.r1\tK5\t60\t1.30\nK5.r1\tK5\t120\t1.52\nK14.r1\tK14\t0\t0\nK14.r1\tK14\t15\t0.35\nK14.r1\tK14\t30\t0.66\nK14.r1\tK14\t60\t1.02\nK14.r1\tK14\t120\t1.28",
    xUnitExample: "min",
    yUnitExample: "a.u.",
    requiresAxisUnits: false,
    templateVersion: "0.1.0",
    recommendationReasonCode: "explicit_saturating_xy_model",
  },
  {
    id: "one_phase_association",
    label: "One-phase association",
    shortDescription: "開始値もデータから推定する、時間などに対する単調な飽和過程",
    formula: "Y = baseline + (plateau − baseline) × (1 − exp(−rate × X))",
    parameters: ["baseline", "plateau", "rate"],
    parameterLabels: { baseline: "baseline", plateau: "plateau", rate: "rate" },
    defaultRationale:
      "反応時間に対する単調な飽和過程で、開始値をデータから推定する必要があるため、one-phase association modelを選択しました。",
    suggestedXLabel: "Time",
    suggestedYLabel: "Response",
    examplePaste:
      "Unit ID\tSeries\tX\tY\nK5.r1\tK5\t0\t0\nK5.r1\tK5\t15\t0.55\nK5.r1\tK5\t30\t0.95\nK5.r1\tK5\t60\t1.30\nK5.r1\tK5\t120\t1.52\nK14.r1\tK14\t0\t0\nK14.r1\tK14\t15\t0.35\nK14.r1\tK14\t30\t0.66\nK14.r1\tK14\t60\t1.02\nK14.r1\tK14\t120\t1.28",
    xUnitExample: "min",
    yUnitExample: "a.u.",
    requiresAxisUnits: false,
    templateVersion: "0.1.0",
    recommendationReasonCode: "explicit_saturating_xy_model",
  },
  {
    id: "michaelis_menten",
    label: "Michaelis–Menten enzyme kinetics",
    shortDescription:
      "基質濃度と反応初速度の関係からVmaxとKmを推定（反応の時系列そのものには使用しません）",
    formula: "v = Vmax × [S] / (Km + [S])",
    parameters: ["vmax", "km"],
    parameterLabels: { vmax: "Vmax", km: "Km" },
    defaultRationale:
      "基質濃度に対する反応初速度の飽和を表し、単一基質のMichaelis–Menten式からVmaxとKmを推定する実験であるため、このmodelを選択しました。",
    suggestedXLabel: "Substrate concentration",
    suggestedYLabel: "Initial velocity",
    examplePaste:
      "Unit ID\tSeries\tX\tY\nreaction-0\tEnzyme A\t0\t0\nreaction-5\tEnzyme A\t5\t2.4\nreaction-10\tEnzyme A\t10\t4.1\nreaction-20\tEnzyme A\t20\t6.3\nreaction-50\tEnzyme A\t50\t8.8",
    xUnitExample: "µM",
    yUnitExample: "µmol/min",
    requiresAxisUnits: true,
    templateVersion: "0.2.0",
    recommendationReasonCode: "explicit_michaelis_menten_kinetics",
  },
] as const;

const definitionsById = new Map(
  NONLINEAR_MODEL_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function nonlinearModelDefinition(modelId: NonlinearModelId): NonlinearModelDefinition {
  const definition = definitionsById.get(modelId);
  if (!definition) throw new Error(`Unknown nonlinear model: ${modelId}`);
  return definition;
}

export function isGeneratedNonlinearRationale(value: string): boolean {
  return NONLINEAR_MODEL_DEFINITIONS.some(({ defaultRationale }) => defaultRationale === value);
}

export function nonlinearParameterLabel(modelId: NonlinearModelId, parameterId: string): string {
  const definition = nonlinearModelDefinition(modelId);
  const unqualifiedParameterId = parameterId.slice(parameterId.lastIndexOf(".") + 1);
  return definition.parameterLabels[unqualifiedParameterId as NonlinearParameterId] ?? parameterId;
}

export function nonlinearModelLabel(modelId: string): string {
  return NONLINEAR_MODEL_DEFINITIONS.find(({ id }) => id === modelId)?.label ?? modelId;
}
