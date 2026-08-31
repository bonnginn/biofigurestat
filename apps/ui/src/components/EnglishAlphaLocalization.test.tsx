import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { HomePage } from "../pages/HomePage";
import { NewExperimentEntryHub } from "./NewExperimentEntryHub";
import { SimpleGroupExperimentEntry } from "./SimpleGroupExperimentEntry";
import { AboutPanel } from "./AboutPanel";
import { ContextualHelp } from "./ContextualHelp";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { CollectionPage } from "../pages/CollectionPage";
import { OpenProjectPage } from "../pages/OpenProjectPage";
import { BiologicalExperimentSetup } from "./BiologicalExperimentSetup";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";
import { createExperimentSetDraft } from "../app/experimentDraft";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

describe("English Public Alpha workflow", () => {
  it("switches Home and the task-oriented entry hub without changing route IDs", () => {
    act(() => setAppLocale("en"));
    const navigate = vi.fn();
    const view = render(<HomePage onNavigate={navigate} />);

    expect(
      screen.getByRole("heading", { name: "Which experiment are you working on?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New experiment/ }));
    expect(navigate).toHaveBeenCalledWith("new-experiment");

    view.rerender(
      <NewExperimentEntryHub
        onSimple={vi.fn()}
        onGeneral={vi.fn()}
        onGraphOnly={vi.fn()}
        onSurvival={vi.fn()}
        onOrderedCurve={vi.fn()}
        onHeatmap={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Where would you like to start?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Simple independent-group comparison" }),
    ).toBeInTheDocument();
    expectNoJapaneseUi(view.container);
  });

  it("creates the same semantic simple-group draft from English controls", () => {
    act(() => setAppLocale("en"));
    const onReady = vi.fn();
    render(<SimpleGroupExperimentEntry onBack={vi.fn()} onReady={onReady} />);

    fireEvent.change(screen.getByLabelText("Condition 1"), { target: { value: "Control" } });
    fireEvent.change(screen.getByLabelText("Condition 2"), { target: { value: "Drug" } });
    fireEvent.change(screen.getByLabelText("Measured readout (graph Y axis)"), {
      target: { value: "Protein amount" },
    });
    fireEvent.change(
      screen.getByLabelText("Experimental unit assigned independently to each condition"),
      { target: { value: "culture dish" } },
    );
    fireEvent.click(
      screen.getByLabelText(/Each condition uses separate experimental units/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create grouped worksheet" }));

    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({
        entryRoute: "simple_independent_groups",
        conditionAssignment: { kind: "independent", unitLabel: "culture dish" },
      }),
    );
    expectNoJapaneseUi(document.body);
  });

  it("exposes local Help, About, and problem reporting in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<AboutPanel />);
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByText("Usage data without research data")).toBeInTheDocument();
    view.unmount();

    const help = render(<ContextualHelp context={{ surface: "data", nested: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("heading", { name: "Terms and analysis concepts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Experimental unit/ })).toBeInTheDocument();
    help.unmount();

    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(screen.getByText("Report to BioFigureStat Public Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText("What were you trying to do?")).toBeInTheDocument();
    expectNoJapaneseUi(document.body);
  });

  it("shows recent projects and the local project picker in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<CollectionPage kind="recent" onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Recent projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start a new experiment/ })).toBeInTheDocument();
    view.unmount();

    render(<OpenProjectPage onNavigate={vi.fn()} openProject={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Open a local project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose project file/ })).toBeInTheDocument();
    expectNoJapaneseUi(document.body);
  });

  it("shows the general biological interview in researcher-facing English", () => {
    act(() => setAppLocale("en"));
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Experimental conditions and measurements" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Treatments and groups" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Measured values" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experimental units and their relationships" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create data table" })).toHaveLength(1);
    expectNoJapaneseUi(document.body);
  });

  it("keeps the common Graph creation dialog in English", () => {
    act(() => setAppLocale("en"));
    const base = createExperimentSetDraft("cell_culture", "nested_continuous");
    const draft = {
      ...base,
      name: "Protein amount",
      attributes: base.attributes.map((attribute) => ({ ...attribute, label: "Treatment" })),
      readouts: [{ ...base.readouts[0], label: "Cell intensity" }],
      conditions: [
        { ...base.conditions[0], label: "Control", attributes: { "attribute.1": "Control" } },
        { ...base.conditions[1], label: "Drug", attributes: { "attribute.1": "Drug" } },
      ],
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Create Graph" }));
    expect(screen.getByRole("heading", { name: "Choose a Graph type" })).toBeInTheDocument();
    expect(screen.getByText("Recommended Graph")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Initial display after creation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create this Graph" })).toBeEnabled();
    expectNoJapaneseUi(document.body);

    fireEvent.click(screen.getByRole("button", { name: "Create this Graph" }));
    expect(screen.getByRole("button", { name: "Graph 1" })).toBeVisible();
    expectNoJapaneseUi(document.body);
  });
});
