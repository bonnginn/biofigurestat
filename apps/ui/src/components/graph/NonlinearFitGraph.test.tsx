import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { serializeGraphSvg } from "../../app/graphExport";
import { NonlinearFitGraph } from "./NonlinearFitGraph";

describe("NonlinearFitGraph", () => {
  it("uses the shared 1/2/5 tick grammar for awkward numeric ranges", () => {
    render(
      <NonlinearFitGraph
        model={{
          modelId: "observed_only",
          series: [
            {
              seriesId: "series.1",
              points: [
                {
                  observationId: "obs.1",
                  experimentalUnitId: "unit.1",
                  seriesId: "series.1",
                  x: 0.858,
                  y: 0.858,
                },
                {
                  observationId: "obs.2",
                  experimentalUnitId: "unit.2",
                  seriesId: "series.1",
                  x: 1.642,
                  y: 1.642,
                },
              ],
              fittedCurve: [],
            },
          ],
        }}
        xLabel="Dose"
        yLabel="Response"
        displayMode="observed_only"
      />,
    );

    const values = (axis: "x" | "y") =>
      [...document.querySelectorAll<SVGLineElement>(`[data-axis-tick="${axis}"]`)].map(
        (tick) => Number(tick.dataset.tickValue),
      );
    expect(values("x")).toEqual([1.6, 1.4, 1.2, 1]);
    expect(values("y")).toEqual([1.5, 1, 0.5, 0]);
  });

  it("renders observed points without implying that a fit has run", () => {
    render(
      <NonlinearFitGraph
        model={{
          modelId: "observed_only",
          series: [
            {
              seriesId: "series.1",
              points: [
                {
                  observationId: "obs.1",
                  experimentalUnitId: "unit.1",
                  seriesId: "series.1",
                  x: 0,
                  y: 1,
                },
                {
                  observationId: "obs.2",
                  experimentalUnitId: "unit.1",
                  seriesId: "series.1",
                  x: 1,
                  y: 2,
                },
              ],
              fittedCurve: [],
            },
          ],
        }}
        xLabel="Time"
        yLabel="Response"
        displayMode="observed_only"
      />,
    );
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toHaveAttribute(
      "data-graph-mode",
      "observed_only",
    );
    expect(document.querySelector('[data-graph-layer="raw-observation"]')).not.toBeNull();
    expect(document.querySelector('[data-graph-layer="authoritative-fitted-curve"]')).toBeNull();
    const xTicks = [...document.querySelectorAll<SVGLineElement>('[data-axis-tick="x"]')];
    const yTicks = [...document.querySelectorAll<SVGLineElement>('[data-axis-tick="y"]')];
    expect(xTicks.length).toBeGreaterThan(0);
    expect(yTicks.length).toBeGreaterThan(0);
    expect(
      xTicks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("y2")) > Number(tick.getAttribute("y1")),
      ),
    ).toBe(true);
    const xMinorTicks = [
      ...document.querySelectorAll<SVGLineElement>('[data-axis-tick="x-minor"]'),
    ];
    const yMinorTicks = [
      ...document.querySelectorAll<SVGLineElement>('[data-axis-tick="y-minor"]'),
    ];
    expect(xMinorTicks.length).toBeGreaterThan(0);
    expect(yMinorTicks.length).toBeGreaterThan(0);
    expect(
      xMinorTicks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("y2")) > Number(tick.getAttribute("y1")),
      ),
    ).toBe(true);
    expect(
      yMinorTicks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("x2")) < Number(tick.getAttribute("x1")),
      ),
    ).toBe(true);
    expect(
      yTicks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("x2")) < Number(tick.getAttribute("x1")),
      ),
    ).toBe(true);
  });

  it("keeps observed points separate from the authoritative saved curve in export", () => {
    render(
      <NonlinearFitGraph
        model={{
          modelId: "zero_baseline_association",
          series: [
            {
              seriesId: "series.1",
              points: [
                {
                  observationId: "observation.1",
                  experimentalUnitId: "unit.1",
                  seriesId: "series.1",
                  x: 0,
                  y: 0,
                },
                {
                  observationId: "observation.2",
                  experimentalUnitId: "unit.1",
                  seriesId: "series.1",
                  x: 10,
                  y: 0.8,
                },
              ],
              fittedCurve: [
                { x: 0, y: 0 },
                { x: 5, y: 0.5 },
                { x: 10, y: 0.82 },
              ],
            },
          ],
        }}
        xLabel="Time (min)"
        yLabel="Product"
        seriesLabels={{ "series.1": "K5" }}
      />,
    );
    const svg = screen.getByRole("img", { name: "非線形フィットGraph" });
    expect(svg.querySelectorAll('[data-graph-layer="raw-observation"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-graph-layer="authoritative-fitted-curve"]')).toHaveLength(1);
    const exported = serializeGraphSvg(svg as unknown as SVGSVGElement);
    expect(exported).toContain('data-fit-model="zero_baseline_association"');
    expect(exported).toContain("観測点 + 保存済みZero-baseline association fit");
    expect(exported).not.toContain(">zero_baseline_association<");
  });

  it("preserves outside axis ticks and all experimental-condition series in the export source", () => {
    const series = [
      { id: "condition.hip", label: "HIP", scale: 1 },
      { id: "condition.ffcc", label: "FFCC", scale: 0.7 },
    ];
    render(
      <NonlinearFitGraph
        model={{
          modelId: "michaelis_menten",
          series: series.map(({ id, scale }) => ({
            seriesId: id,
            points: [0, 5, 10].map((x, index) => ({
              observationId: `${id}.${index}`,
              experimentalUnitId: `${id}.unit.${index}`,
              seriesId: id,
              x,
              y: scale * index,
            })),
            fittedCurve: [
              { x: 0, y: 0 },
              { x: 5, y: scale },
              { x: 10, y: scale * 2 },
            ],
          })),
        }}
        xLabel="Substrate concentration"
        yLabel="Initial velocity"
        title="Enzyme kinetics"
        palette={["#112233", "#445566"]}
        seriesLabels={Object.fromEntries(series.map(({ id, label }) => [id, label]))}
      />,
    );

    const svg = screen.getByRole("img", {
      name: "非線形フィットGraph",
    }) as unknown as SVGSVGElement;
    expect(svg.querySelectorAll("[data-fit-series]")).toHaveLength(2);
    expect(svg.querySelectorAll('[data-graph-layer="raw-observation"]')).toHaveLength(6);
    expect(svg.querySelectorAll('[data-graph-layer="authoritative-fitted-curve"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-graph-layer="series-legend"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-legend-mark="observed-points"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-legend-mark="fitted-curve"]')).toHaveLength(2);
    expect(svg).toHaveTextContent("HIP");
    expect(svg).toHaveTextContent("FFCC");
    expect(svg).toHaveTextContent("Enzyme kinetics");
    expect(svg.querySelector('[data-fit-series="condition.hip"] circle')).toHaveAttribute(
      "stroke",
      "#112233",
    );
    expect(
      [...svg.querySelectorAll<SVGLineElement>('[data-axis-tick="x"]')].every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("y2")) > Number(tick.getAttribute("y1")),
      ),
    ).toBe(true);

    const exported = serializeGraphSvg(svg);
    const exportedSvg = new DOMParser().parseFromString(exported, "image/svg+xml");
    expect(exportedSvg.querySelector("parsererror")).toBeNull();
    expect(exportedSvg.querySelectorAll("[data-fit-series]")).toHaveLength(2);
    expect(
      exportedSvg.querySelectorAll('[data-axis-tick="x"][data-tick-direction="outside"]'),
    ).not.toHaveLength(0);
    expect(
      exportedSvg.querySelectorAll('[data-axis-tick="x-minor"][data-tick-direction="outside"]'),
    ).toHaveLength(svg.querySelectorAll('[data-axis-tick="x-minor"]').length);
    expect(
      exportedSvg.querySelectorAll('[data-axis-tick="y-minor"][data-tick-direction="outside"]'),
    ).toHaveLength(svg.querySelectorAll('[data-axis-tick="y-minor"]').length);
    expect(exportedSvg.querySelectorAll('[data-graph-layer="series-legend"]')).toHaveLength(2);
    expect(exportedSvg.querySelectorAll('[data-legend-mark="observed-points"]')).toHaveLength(2);
    expect(exportedSvg.querySelectorAll('[data-legend-mark="fitted-curve"]')).toHaveLength(2);
    expect(exportedSvg.documentElement.textContent).toContain("HIP");
    expect(exportedSvg.documentElement.textContent).toContain("FFCC");
    expect(exportedSvg.documentElement.textContent).toContain("Enzyme kinetics");
  });
});
