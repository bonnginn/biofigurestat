import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { serializeGraphSvg } from "../../app/graphExport";
import { NonlinearFitGraph } from "./NonlinearFitGraph";

describe("NonlinearFitGraph", () => {
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
    expect(exported).toContain("saved zero_baseline_association fit");
  });
});
