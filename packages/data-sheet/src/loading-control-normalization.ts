import { TransformationSpecSchema, type Observation } from "@lsaa/domain";

export type LoadingControlRatio = Readonly<{
  experimentalUnitId: string;
  conditionId: string;
  value: number;
  targetObservationId: string;
  loadingControlObservationId: string;
}>;

export type LoadingControlNormalizationResult = Readonly<{
  transformation: ReturnType<typeof TransformationSpecSchema.parse>;
  ratios: LoadingControlRatio[];
}>;

/** Creates target/loading-control ratios without altering either raw intensity. */
export function normalizeByLoadingControl(input: {
  transformationId: string;
  rawRevisionId: string;
  targetOutcomeId: string;
  loadingControlOutcomeId: string;
  observations: ReadonlyArray<Observation>;
}): LoadingControlNormalizationResult {
  if (input.targetOutcomeId === input.loadingControlOutcomeId) {
    throw new Error("Target and loading-control outcomes must be different");
  }
  const selected = input.observations.filter(
    (observation) =>
      observation.rawRevisionId === input.rawRevisionId &&
      (observation.outcomeId === input.targetOutcomeId ||
        observation.outcomeId === input.loadingControlOutcomeId),
  );
  if (selected.length === 0)
    throw new Error("No raw band intensities match the requested revision");

  const grouped = new Map<string, Observation[]>();
  selected.forEach((observation) => {
    if (observation.measurement.kind !== "scalar") {
      throw new Error("Loading-control normalization requires scalar band intensities");
    }
    const key = `${observation.unitInstanceId}\u0000${observation.conditionId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });

  const ratios = [...grouped.values()].map((group): LoadingControlRatio => {
    const targets = group.filter((observation) => observation.outcomeId === input.targetOutcomeId);
    const controls = group.filter(
      (observation) => observation.outcomeId === input.loadingControlOutcomeId,
    );
    if (targets.length !== 1 || controls.length !== 1) {
      throw new Error(
        "Each biological unit requires exactly one target and one loading-control intensity",
      );
    }
    const target = targets[0];
    const control = controls[0];
    const targetValue = target.measurement.kind === "scalar" ? target.measurement.value : NaN;
    const controlValue = control.measurement.kind === "scalar" ? control.measurement.value : NaN;
    if (!Number.isFinite(targetValue) || !Number.isFinite(controlValue)) {
      throw new Error("Band intensities must be finite numbers");
    }
    if (controlValue === 0) throw new Error("Loading-control intensity cannot be zero");
    return {
      experimentalUnitId: target.unitInstanceId,
      conditionId: target.conditionId,
      value: targetValue / controlValue,
      targetObservationId: target.id,
      loadingControlObservationId: control.id,
    };
  });

  return {
    transformation: TransformationSpecSchema.parse({
      id: input.transformationId,
      version: "0.1.0",
      method: "loading_control_ratio",
      inputRevisionIds: [input.rawRevisionId],
      parameters: {
        targetOutcomeId: input.targetOutcomeId,
        loadingControlOutcomeId: input.loadingControlOutcomeId,
        sourceObservationPairs: ratios.map((ratio) => ({
          experimentalUnitId: ratio.experimentalUnitId,
          conditionId: ratio.conditionId,
          targetObservationId: ratio.targetObservationId,
          loadingControlObservationId: ratio.loadingControlObservationId,
        })),
      },
    }),
    ratios,
  };
}
