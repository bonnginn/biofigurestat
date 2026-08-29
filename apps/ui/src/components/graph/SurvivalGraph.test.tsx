import { render, screen } from "@testing-library/react";
import { createKaplanMeierGraphModel } from "@lsaa/graph-spec";
import { describe, expect, it } from "vitest";

import { serializeGraphSvg } from "../../app/graphExport";
import { SurvivalGraph } from "./SurvivalGraph";

describe("SurvivalGraph", () => {
  it("applies persisted axis labels and palette without changing Kaplan–Meier geometry", () => {
    const model = createKaplanMeierGraphModel(
      [{ id: "control", label: "Control" }],
      [
        {
          observationId: "control.1",
          experimentalUnitId: "mouse.control.1",
          conditionId: "control",
          followUpTime: 4,
          eventObserved: true,
        },
      ],
    );
    const originalSteps = structuredClone(model.groups[0]?.steps);
    render(
      <SurvivalGraph
        model={model}
        timeLabel="Days after treatment"
        probabilityLabel="Tumor-free probability"
        palette={["#123456"]}
      />,
    );

    const svg = screen.getByRole("img", {
      name: "Kaplan–Meier survival graph",
    }) as unknown as SVGSVGElement;
    expect(svg).toHaveTextContent("Days after treatment");
    expect(svg).toHaveTextContent("Tumor-free probability");
    expect(svg.querySelector('[data-graph-layer="survival-curve"]')).toHaveAttribute(
      "stroke",
      "#123456",
    );
    expect(model.groups[0]?.steps).toEqual(originalSteps);
  });

  it("keeps readable probability ticks and every cohort curve in SVG/PNG export source", () => {
    const model = createKaplanMeierGraphModel(
      [
        { id: "control", label: "Control" },
        { id: "treatment", label: "Treatment" },
      ],
      [
        {
          observationId: "control.1",
          experimentalUnitId: "mouse.control.1",
          conditionId: "control",
          followUpTime: 4,
          eventObserved: true,
        },
        {
          observationId: "control.2",
          experimentalUnitId: "mouse.control.2",
          conditionId: "control",
          followUpTime: 8,
          eventObserved: false,
        },
        {
          observationId: "treatment.1",
          experimentalUnitId: "mouse.treatment.1",
          conditionId: "treatment",
          followUpTime: 6,
          eventObserved: true,
        },
        {
          observationId: "treatment.2",
          experimentalUnitId: "mouse.treatment.2",
          conditionId: "treatment",
          followUpTime: 10,
          eventObserved: false,
        },
      ],
    );
    render(<SurvivalGraph model={model} annotation="p = 0.272" />);

    const svg = screen.getByRole("img", {
      name: "Kaplan–Meier survival graph",
    }) as unknown as SVGSVGElement;
    const tickLabels = [...svg.querySelectorAll<SVGTextElement>('[data-axis-tick-label="y"]')];
    expect(tickLabels.map((tick) => tick.textContent)).toEqual(["0", "0.25", "0.5", "0.75", "1"]);
    expect(tickLabels.every((tick) => Number(tick.getAttribute("font-size")) >= 12)).toBe(true);
    const ticks = [...svg.querySelectorAll<SVGLineElement>('[data-axis-tick="y"]')];
    expect(ticks).toHaveLength(5);
    expect(
      ticks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("x2")) < Number(tick.getAttribute("x1")),
      ),
    ).toBe(true);
    const xTicks = [...svg.querySelectorAll<SVGLineElement>('[data-axis-tick="x"]')];
    const minorTicks = [
      ...svg.querySelectorAll<SVGLineElement>(
        '[data-axis-tick="x-minor"], [data-axis-tick="y-minor"]',
      ),
    ];
    expect(xTicks.length).toBeGreaterThan(0);
    expect(minorTicks.length).toBeGreaterThan(0);
    expect(
      xTicks.every(
        (tick) =>
          tick.dataset.tickDirection === "outside" &&
          Number(tick.getAttribute("y2")) > Number(tick.getAttribute("y1")),
      ),
    ).toBe(true);
    expect(
      minorTicks.every((tick) => {
        if (tick.dataset.axisTick === "x-minor") {
          return Number(tick.getAttribute("y2")) > Number(tick.getAttribute("y1"));
        }
        return Number(tick.getAttribute("x2")) < Number(tick.getAttribute("x1"));
      }),
    ).toBe(true);
    expect(svg.querySelectorAll('[data-graph-layer="survival-curve"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-graph-layer="series-legend"]')).toHaveLength(2);
    const riskTitle = svg.querySelector<SVGTextElement>('[data-graph-layer="risk-table-title"]');
    const timeZero = svg.querySelector<SVGTextElement>(
      '[data-graph-layer="risk-time-header"][data-risk-time="4"]',
    );
    const firstRiskGroup = svg.querySelector<SVGTextElement>(
      '[data-graph-layer="risk-group-label"]',
    );
    expect(riskTitle).not.toBeNull();
    expect(timeZero).not.toBeNull();
    expect(firstRiskGroup).not.toBeNull();
    expect(Number(timeZero?.getAttribute("y"))).toBeGreaterThan(
      Number(riskTitle?.getAttribute("y")),
    );
    expect(Number(firstRiskGroup?.getAttribute("y"))).toBeGreaterThan(
      Number(timeZero?.getAttribute("y")),
    );
    expect(Number(timeZero?.getAttribute("x"))).not.toBeNaN();

    const exported = serializeGraphSvg(svg);
    const exportedSvg = new DOMParser().parseFromString(exported, "image/svg+xml");
    expect(exportedSvg.querySelector("parsererror")).toBeNull();
    expect(
      [...exportedSvg.querySelectorAll('[data-axis-tick-label="y"]')].map(
        (tick) => tick.textContent,
      ),
    ).toEqual(["0", "0.25", "0.5", "0.75", "1"]);
    expect(exportedSvg.querySelectorAll('[data-graph-layer="survival-curve"]')).toHaveLength(2);
    expect(
      exportedSvg.querySelectorAll('[data-axis-tick="x-minor"][data-tick-direction="outside"]'),
    ).toHaveLength(svg.querySelectorAll('[data-axis-tick="x-minor"]').length);
    expect(
      exportedSvg.querySelectorAll('[data-axis-tick="y-minor"][data-tick-direction="outside"]'),
    ).toHaveLength(svg.querySelectorAll('[data-axis-tick="y-minor"]').length);
    expect(exportedSvg.querySelectorAll('[data-graph-layer="series-legend"]')).toHaveLength(2);
    expect(exportedSvg.documentElement.textContent).toContain("Control");
    expect(exportedSvg.documentElement.textContent).toContain("Treatment");
    expect(
      exportedSvg.querySelector('[data-graph-layer="statistics-annotation"]')?.textContent,
    ).toBe("p = 0.272");
  });

  it("separates the risk title, a time-zero header, and the first group row", () => {
    const model = createKaplanMeierGraphModel(
      [{ id: "control", label: "Control" }],
      [
        {
          observationId: "control.zero",
          experimentalUnitId: "mouse.control.zero",
          conditionId: "control",
          followUpTime: 0,
          eventObserved: false,
        },
        {
          observationId: "control.later",
          experimentalUnitId: "mouse.control.later",
          conditionId: "control",
          followUpTime: 10,
          eventObserved: true,
        },
      ],
    );
    render(<SurvivalGraph model={model} />);

    const svg = screen.getByRole("img", {
      name: "Kaplan–Meier survival graph",
    }) as unknown as SVGSVGElement;
    const riskTitle = svg.querySelector<SVGTextElement>('[data-graph-layer="risk-table-title"]')!;
    const timeZero = svg.querySelector<SVGTextElement>(
      '[data-graph-layer="risk-time-header"][data-risk-time="0"]',
    )!;
    const firstGroup = svg.querySelector<SVGTextElement>('[data-graph-layer="risk-group-label"]')!;

    expect(riskTitle.textContent).toBe("Number at risk");
    expect(timeZero.textContent).toBe("0");
    expect(Number(riskTitle.getAttribute("x"))).toBe(Number(timeZero.getAttribute("x")));
    expect(
      Number(timeZero.getAttribute("y")) - Number(riskTitle.getAttribute("y")),
    ).toBeGreaterThanOrEqual(20);
    expect(
      Number(firstGroup.getAttribute("y")) - Number(timeZero.getAttribute("y")),
    ).toBeGreaterThanOrEqual(20);

    const exportedSvg = new DOMParser().parseFromString(serializeGraphSvg(svg), "image/svg+xml");
    expect(
      exportedSvg.querySelector('[data-graph-layer="risk-time-header"][data-risk-time="0"]')
        ?.textContent,
    ).toBe("0");
    expect(exportedSvg.querySelectorAll('[data-graph-layer="risk-group-label"]')).toHaveLength(1);
  });
});
