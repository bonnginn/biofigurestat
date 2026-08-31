import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

export type GraphPaletteMode = WorkspaceGraphState["appearance"]["palette"];

export const GRAPH_PALETTES: Record<GraphPaletteMode, readonly string[]> = {
  single: ["#245c8a"],
  condition: ["#245c8a", "#c26532", "#3e7c67", "#735a8d", "#9a7628", "#467681"],
  grayscale: ["#111111", "#4b5563", "#7a828d", "#a0a6ad", "#c0c4c9"],
  colorblind: ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9"],
  publication: ["#2B5F8A", "#A45137", "#47745D", "#6C5A80", "#8A6B28", "#467681"],
};
