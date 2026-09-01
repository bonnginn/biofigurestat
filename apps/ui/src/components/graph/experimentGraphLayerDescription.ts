import type { ExperimentSetDraft, ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

export function describeActiveGraphLayers(
  input: Readonly<{
    graphType: WorkspaceGraphState["graphType"];
    shape: ReadoutDraft["shape"];
    layers: WorkspaceGraphState["layers"];
    errorBar: WorkspaceGraphState["appearance"]["errorBar"];
    timeSampling: ExperimentSetDraft["time"]["sampling"];
    matched: boolean;
  }>,
): string {
  const { graphType, shape, layers, errorBar, timeSampling, matched } = input;
  if (shape === "categorical_counts") {
    if (graphType === "stacked") return "Stacked category counts";
    if (graphType === "category_percentage") return "Category percentages";
    return "100% stacked composition";
  }
  if (graphType === "scatter") return "Paired X–Y observations";
  if (graphType === "line") {
    const parts = [
      ...(timeSampling === "longitudinal" && matched ? ["Individual trajectories"] : []),
      "Summary trend",
      ...(layers.experiment
        ? [shape === "nested_continuous" ? "Experiment summaries" : "Biological replicates"]
        : []),
      ...(layers.overall && layers.errorBar && errorBar !== "none"
        ? [`${errorBar.toUpperCase()} error bars`]
        : []),
    ];
    return parts.join(" + ");
  }
  if (graphType === "paired_dot") {
    return (
      [
        ...(layers.experiment ? ["Paired observations"] : []),
        ...(layers.connectingLine ? ["Connecting lines"] : []),
        ...(layers.overall
          ? [layers.errorBar && errorBar !== "none" ? `Mean ± ${errorBar.toUpperCase()}` : "Mean"]
          : []),
      ].join(" + ") || "Paired Graph"
    );
  }

  const parts: string[] = [];
  if (graphType === "bar") parts.push("Bars (Mean)");
  if (layers.violin) parts.push("Distribution");
  if (layers.box || (shape === "nested_continuous" && layers.distribution)) {
    parts.push("Box plot");
  }
  if (shape === "nested_continuous" && layers.raw) parts.push("Raw observations");
  if (layers.experiment) {
    parts.push(shape === "nested_continuous" ? "Experiment summaries" : "Biological replicates");
  }
  if (layers.overall && graphType !== "bar") {
    if (layers.errorBar && errorBar !== "none") {
      parts.push(
        graphType === "dot"
          ? `Mean ± ${errorBar.toUpperCase()}`
          : `${errorBar.toUpperCase()} error bars`,
      );
    } else {
      parts.push("Mean");
    }
  } else if (graphType === "bar" && layers.overall && layers.errorBar && errorBar !== "none") {
    parts.push(`${errorBar.toUpperCase()} error bars`);
  }
  return parts.join(" + ") || "No data layers selected";
}
