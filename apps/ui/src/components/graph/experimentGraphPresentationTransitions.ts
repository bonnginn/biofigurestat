import type { Dispatch, SetStateAction } from "react";

import { defaultLayersForGraphType } from "../../app/graphDefaults";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { graphPresentationForPreset } from "./experimentGraphPresets";

type Preset = Parameters<typeof graphPresentationForPreset>[0]["preset"];
type ReadoutShape = Parameters<typeof defaultLayersForGraphType>[1];

type Input = Readonly<{
  graphType: WorkspaceGraphState["graphType"];
  shape: ReadoutShape;
  visualSeriesCount: number;
  appearance: WorkspaceGraphState["appearance"];
  timePointCount: number;
  activeConditionCount: number;
  setGraphType: (graphType: WorkspaceGraphState["graphType"]) => void;
  setLayers: Dispatch<SetStateAction<WorkspaceGraphState["layers"]>>;
  setAppearance: Dispatch<SetStateAction<WorkspaceGraphState["appearance"]>>;
}>;

/** Presentation-only transitions; no data or scientific identity is changed. */
export function createExperimentGraphPresentationTransitions(input: Input) {
  const applyPreset = (preset: Preset) => {
    const next = graphPresentationForPreset({
      preset,
      graphType: input.graphType,
      shape: input.shape,
      visualSeriesCount: input.visualSeriesCount,
      currentAppearance: input.appearance,
    });
    input.setLayers(next.layers);
    input.setAppearance(next.appearance);
  };

  const changeGraphType = (nextType: WorkspaceGraphState["graphType"]) => {
    input.setGraphType(nextType);
    input.setLayers(defaultLayersForGraphType(nextType, input.shape));
    if (nextType === "line" && input.timePointCount > 1 && input.activeConditionCount > 1) {
      input.setAppearance((current) => ({
        ...current,
        palette: current.palette === "single" ? "colorblind" : current.palette,
        legendPosition: current.legendPosition === "hidden" ? "right" : current.legendPosition,
      }));
    }
  };

  return { applyPreset, changeGraphType };
}
