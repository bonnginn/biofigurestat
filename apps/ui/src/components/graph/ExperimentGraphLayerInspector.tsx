import type { ComponentProps } from "react";

import { ExperimentGraphConnectingLineEditor } from "./ExperimentGraphConnectingLineEditor";
import { ExperimentGraphDistributionEditor } from "./ExperimentGraphDistributionEditor";
import { ExperimentGraphErrorBarEditor } from "./ExperimentGraphErrorBarEditor";
import { ExperimentGraphLegendEditor } from "./ExperimentGraphLegendEditor";
import { ExperimentGraphRawDotsEditor } from "./ExperimentGraphRawDotsEditor";
import { ExperimentGraphSeriesEditor } from "./ExperimentGraphSeriesEditor";
import type { GraphInspectorTarget } from "./useExperimentGraphWorkspaceEffects";

type Props = Readonly<{
  target: GraphInspectorTarget;
  shape: ComponentProps<typeof ExperimentGraphRawDotsEditor>["shape"];
  layers: ComponentProps<typeof ExperimentGraphRawDotsEditor>["layers"];
  appearance: ComponentProps<typeof ExperimentGraphRawDotsEditor>["appearance"];
  visualSeriesOptions: ComponentProps<typeof ExperimentGraphSeriesEditor>["visualSeriesOptions"];
  setLayers: ComponentProps<typeof ExperimentGraphRawDotsEditor>["setLayers"];
  setAppearance: ComponentProps<typeof ExperimentGraphRawDotsEditor>["setAppearance"];
}>;

/** Layer/appearance inspectors only; Graph data and analysis state are deliberately absent. */
export function ExperimentGraphLayerInspector({
  target,
  shape,
  layers,
  appearance,
  visualSeriesOptions,
  setLayers,
  setAppearance,
}: Props) {
  if (target === "raw-dots") {
    return (
      <ExperimentGraphRawDotsEditor
        shape={shape}
        layers={layers}
        appearance={appearance}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
    );
  }
  if (target === "experiment-summary" || target === "series-style") {
    return (
      <ExperimentGraphSeriesEditor
        mode={target}
        layers={layers}
        appearance={appearance}
        visualSeriesOptions={visualSeriesOptions}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
    );
  }
  if (target === "violin" || target === "box") {
    return (
      <ExperimentGraphDistributionEditor
        mode={target}
        shape={shape}
        layers={layers}
        appearance={appearance}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
    );
  }
  if (target === "error-bar") {
    return (
      <ExperimentGraphErrorBarEditor
        layers={layers}
        appearance={appearance}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
    );
  }
  if (target === "connecting-line") {
    return (
      <ExperimentGraphConnectingLineEditor
        layers={layers}
        appearance={appearance}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
    );
  }
  if (target === "legend") {
    return <ExperimentGraphLegendEditor appearance={appearance} setAppearance={setAppearance} />;
  }
  return null;
}
