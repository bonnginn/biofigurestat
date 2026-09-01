export type GraphPanelSource = Readonly<{
  graphId: string;
  displayName: string;
  svgText: string;
}>;

const SVG_NS = "http://www.w3.org/2000/svg";
const CELL_WIDTH = 620;
const CELL_HEIGHT = 560;
const GRAPH_INSET = 34;
const LABEL_HEIGHT = 46;

function panelLetter(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function parseSvg(svgText: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
    throw new Error("A saved Graph could not be parsed as SVG");
  }
  return document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
}

function namespaceSvgIds(svg: SVGSVGElement, prefix: string): void {
  const replacements = new Map<string, string>();
  svg.querySelectorAll<SVGElement>("[id]").forEach((element) => {
    const original = element.id;
    const replacement = `${prefix}${original}`;
    replacements.set(original, replacement);
    element.id = replacement;
  });
  if (replacements.size === 0) return;
  svg.querySelectorAll<SVGElement>("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      let value = attribute.value;
      replacements.forEach((replacement, original) => {
        value = value.replaceAll(`url(#${original})`, `url(#${replacement})`);
        if (value === `#${original}`) value = `#${replacement}`;
      });
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    });
  });
}

/**
 * Arranges already-rendered saved Graphs without recalculating data or statistics.
 * Source Graph IDs and display names are retained as machine-readable metadata.
 */
export function serializeGraphPanelSvg(
  sources: readonly GraphPanelSource[],
  requestedColumns = 2,
): string {
  if (sources.length < 2) throw new Error("A panel requires at least two saved Graphs");
  const columns = Math.max(1, Math.min(Math.floor(requestedColumns), sources.length));
  const rows = Math.ceil(sources.length / columns);
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("version", "1.1");
  root.setAttribute("width", String(columns * CELL_WIDTH));
  root.setAttribute("height", String(rows * CELL_HEIGHT));
  root.setAttribute("viewBox", `0 0 ${columns * CELL_WIDTH} ${rows * CELL_HEIGHT}`);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "BioFigureStat Graph panel");

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "BioFigureStat Graph panel";
  root.append(title);
  const metadata = document.createElementNS(SVG_NS, "metadata");
  metadata.textContent = JSON.stringify({
    schemaVersion: "1.0.0",
    kind: "biofigurestat_graph_panel",
    sources: sources.map(({ graphId, displayName }, index) => ({
      panelLabel: panelLetter(index),
      graphId,
      displayName,
    })),
  });
  root.append(metadata);
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#fff");
  root.append(background);

  sources.forEach((source, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const offsetX = column * CELL_WIDTH;
    const offsetY = row * CELL_HEIGHT;
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("data-panel-source-graph-id", source.graphId);
    group.setAttribute("transform", `translate(${offsetX} ${offsetY})`);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(GRAPH_INSET));
    label.setAttribute("y", "32");
    label.setAttribute("font-family", "Arial, sans-serif");
    label.setAttribute("font-size", "24");
    label.setAttribute("font-weight", "700");
    label.setAttribute("fill", "#000");
    label.textContent = `${panelLetter(index)}  ${source.displayName}`;
    group.append(label);

    const graph = parseSvg(source.svgText);
    namespaceSvgIds(graph, `panel-${index}-`);
    graph.removeAttribute("role");
    graph.removeAttribute("aria-label");
    graph.setAttribute("x", String(GRAPH_INSET));
    graph.setAttribute("y", String(LABEL_HEIGHT));
    graph.setAttribute("width", String(CELL_WIDTH - GRAPH_INSET * 2));
    graph.setAttribute("height", String(CELL_HEIGHT - LABEL_HEIGHT - GRAPH_INSET));
    graph.setAttribute("preserveAspectRatio", "xMidYMid meet");
    group.append(graph);
    root.append(group);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
}
