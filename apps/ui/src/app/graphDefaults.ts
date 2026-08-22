import type { ReadoutDraft, ReadoutShape } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

export function defaultLayersForGraphType(
  graphType: WorkspaceGraphState["graphType"],
  shape: ReadoutShape,
): WorkspaceGraphState["layers"] {
  const nested = shape === "nested_continuous";
  const violin = graphType === "violin";
  const box = graphType === "box";
  const summaryGraph = graphType === "dot" || graphType === "bar" || graphType === "line";

  return {
    raw: nested && violin,
    distribution: box,
    experiment: true,
    overall: summaryGraph,
    violin,
    box,
    errorBar: summaryGraph,
    connectingLine: graphType === "line" || graphType === "paired_dot",
  };
}

export function defaultGraphYTitle(readout: ReadoutDraft | undefined): string {
  if (!readout) return "Measurement";
  if (readout.shape === "categorical_counts") return "Composition (%)";
  if (readout.shape === "wb_ratio") {
    const ratio = `${readout.label} / ${readout.referenceLabel ?? "reference"}`;
    if (readout.withinExperimentNormalization?.method === "control_equals_one") {
      return `Relative ${ratio} (control = 1)`;
    }
    if (readout.withinExperimentNormalization?.method === "per_unit_maximum") {
      return `Relative ${ratio} (maximum = 1)`;
    }
    return ratio;
  }
  if (readout.shape === "proportion" && readout.label === "Marker X陽性率") {
    return "Percentage of Marker X-positive cells";
  }
  if (readout.shape === "nested_continuous" && readout.label === "細胞強度") {
    return readout.unit ? `Intensity (${readout.unit})` : "Intensity";
  }
  return readout.unit ? `${readout.label} (${readout.unit})` : readout.label;
}
