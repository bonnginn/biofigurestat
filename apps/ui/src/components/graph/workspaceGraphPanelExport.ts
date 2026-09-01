import type { ControlledGraphExportResult } from "../../app/graphExportController";
import type { GraphPanelSource } from "./graphPanelExport";

type GraphIdentity = Readonly<{ id: string; displayName: string }>;

type Dependencies = Readonly<{
  serializeGraph: (svg: SVGSVGElement) => string;
  serializePanel: (sources: readonly GraphPanelSource[]) => string;
  savePanel: (svgText: string, filename: string) => Promise<ControlledGraphExportResult>;
  safeFileStem: (value: string) => string;
}>;

async function defaultDependencies(): Promise<Dependencies> {
  const [graphExport, exportController, dataExport, panelExport] = await Promise.all([
    import("../../app/graphExport"),
    import("../../app/graphExportController"),
    import("./experimentGraphDataExport"),
    import("./graphPanelExport"),
  ]);
  return {
    serializeGraph: graphExport.serializeGraphSvg,
    serializePanel: panelExport.serializeGraphPanelSvg,
    savePanel: exportController.saveGraphPanelSvgExport,
    safeFileStem: dataExport.safeGraphFileStem,
  };
}

/** Collects rendered saved Graphs in project order and exports one provenance-linked panel SVG. */
export async function exportWorkspaceGraphPanel(input: Readonly<{
  root: HTMLElement;
  graphs: readonly GraphIdentity[];
  projectTitle: string;
  dependencies?: Dependencies;
}>): Promise<ControlledGraphExportResult> {
  if (input.graphs.length < 2) throw new Error("A panel requires at least two saved Graphs");
  const dependencies = input.dependencies ?? (await defaultDependencies());
  const containers = [
    ...input.root.querySelectorAll<HTMLElement>("[data-workspace-graph-id]"),
  ];
  const sources = input.graphs.map((graph) => {
    const container = containers.find(
      (candidate) => candidate.dataset.workspaceGraphId === graph.id,
    );
    const svg = container?.querySelector<SVGSVGElement>("svg[role='img']");
    if (!svg) throw new Error(`Graph ${graph.id} is not ready for panel export`);
    return {
      graphId: graph.id,
      displayName: graph.displayName,
      svgText: dependencies.serializeGraph(svg),
    };
  });
  return dependencies.savePanel(
    dependencies.serializePanel(sources),
    `${dependencies.safeFileStem(input.projectTitle)}-panel.svg`,
  );
}

