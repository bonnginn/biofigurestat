import type { ReadoutDraft } from "../../app/experimentDraft";
import { defaultLayersForGraphType } from "../../app/graphDefaults";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphDisplayPreset } from "./ExperimentGraphAppearanceEditor";
import {
  DEFAULT_GRAPH_APPEARANCE,
  DEFAULT_GRAPH_LAYERS,
} from "./useExperimentGraphPresentationState";

export function graphPresentationForPreset(input: Readonly<{
  preset: GraphDisplayPreset;
  graphType: WorkspaceGraphState["graphType"];
  shape: ReadoutDraft["shape"];
  visualSeriesCount: number;
  currentAppearance: WorkspaceGraphState["appearance"];
}>): Pick<WorkspaceGraphState, "layers" | "appearance"> {
  const defaultAppearance: WorkspaceGraphState["appearance"] = {
    ...DEFAULT_GRAPH_APPEARANCE,
    ...(input.visualSeriesCount > 1
      ? { legendPosition: "right" as const, palette: "condition" as const }
      : {}),
  };
  const restrainedLayers = defaultLayersForGraphType(input.graphType, input.shape);

  switch (input.preset) {
    case "raw":
      return {
        layers: {
          ...DEFAULT_GRAPH_LAYERS,
          raw: true,
          distribution: true,
          experiment: true,
          overall: false,
        },
        appearance: { ...input.currentAppearance, palette: "condition" },
      };
    case "replicate":
      return {
        layers: {
          ...DEFAULT_GRAPH_LAYERS,
          raw: false,
          distribution: false,
          box: false,
          experiment: true,
          overall: true,
        },
        appearance: defaultAppearance,
      };
    case "publication":
      return {
        layers: restrainedLayers,
        appearance: { ...defaultAppearance, pointSize: 6, axisLineWidth: 1.4 },
      };
    case "presentation":
      return {
        layers: restrainedLayers,
        appearance: {
          ...defaultAppearance,
          palette: input.visualSeriesCount > 1 ? "condition" : "publication",
          pointSize: 8,
          axisLineWidth: 2,
        },
      };
    case "simple":
      return { layers: restrainedLayers, appearance: defaultAppearance };
  }
}
