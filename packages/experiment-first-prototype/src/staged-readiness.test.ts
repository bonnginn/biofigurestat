import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPERIMENT_CANVAS_VERSION, validateExperimentCanvas } from "./experiment-canvas.ts";
import { evaluateReadiness, nextTargetedQuestion, type EntryFact } from "./staged-readiness.ts";
import { compileGoldCase } from "./compiler.ts";
import { loadGoldSet } from "./evaluation.ts";
import { completeStructureFacts, graphRequestFor, graphStageFacts, statisticsRequestFor } from "./gold-readiness.ts";
import { resolve } from "node:path";

const graphFacts: EntryFact[] = [
  { key: "condition_plan", state: "known", source: "canvas" },
  { key: "readout_definition", state: "known", source: "canvas" },
  { key: "observation_pattern", state: "known", source: "researcher_answer" },
  { key: "observation_mapping", state: "known", source: "data_mapping" },
  { key: "graph_grouping", state: "known", source: "researcher_answer" },
];

describe("progressive semantic entry", () => {
  it("rejects ambiguous or duplicated condition cells before data mapping", () => {
    const base = {
      schemaVersion: EXPERIMENT_CANVAS_VERSION,
      experimentLabel: "two treatments",
      dimensions: [{
        key: "treatment",
        label: "Treatment",
        kind: "intervention" as const,
        values: [
          { key: "vehicle", label: "Vehicle", parentValueKey: null },
          { key: "drug", label: "Drug", parentValueKey: null },
        ],
      }],
      readouts: [{ key: "signal", label: "Signal", representation: "scalar" as const, componentLabels: ["value"] }],
    };
    assert.throws(
      () => validateExperimentCanvas({ ...base, conditionCells: [{ key: "missing", values: {}, status: "unknown" }] }),
      /one value for every dimension/,
    );
    assert.throws(
      () => validateExperimentCanvas({
        ...base,
        conditionCells: [
          { key: "first", values: { treatment: "vehicle" }, status: "performed" },
          { key: "duplicate", values: { treatment: "vehicle" }, status: "not_performed_by_design" },
        ],
      }),
      /duplicated/,
    );
  });

  it("rejects duplicate measurement keys", () => {
    assert.throws(() => validateExperimentCanvas({
      schemaVersion: EXPERIMENT_CANVAS_VERSION,
      experimentLabel: "duplicate readout",
      dimensions: [],
      conditionCells: [{ key: "only", values: {}, status: "performed" }],
      readouts: [
        { key: "signal", label: "Signal A", representation: "scalar", componentLabels: ["value"] },
        { key: "signal", label: "Signal B", representation: "scalar", componentLabels: ["value"] },
      ],
    }), /readout keys/);
  });

  it("represents a sparse siRNA by Dox plan without inventing unperformed cells", () => {
    const canvas = validateExperimentCanvas({
      schemaVersion: EXPERIMENT_CANVAS_VERSION,
      experimentLabel: "siRNA and Dox",
      dimensions: [
        {
          key: "sirna",
          label: "siRNA",
          kind: "intervention",
          groups: [{ key: "gene_a", label: "gene A" }],
          values: [
            { key: "control", label: "control", parentValueKey: null },
            { key: "gene_a_1", label: "#1", parentValueKey: null, groupKey: "gene_a" },
          ],
        },
        {
          key: "dox",
          label: "Dox",
          kind: "intervention",
          values: [
            { key: "minus", label: "-", parentValueKey: null },
            { key: "plus", label: "+", parentValueKey: null },
          ],
        },
      ],
      conditionCells: [
        { key: "control-minus", values: { sirna: "control", dox: "minus" }, status: "performed" },
        { key: "control-plus", values: { sirna: "control", dox: "plus" }, status: "not_performed_by_design" },
        { key: "gene-a-1-minus", values: { sirna: "gene_a_1", dox: "minus" }, status: "performed" },
        { key: "gene-a-1-plus", values: { sirna: "gene_a_1", dox: "plus" }, status: "performed" },
      ],
      readouts: [
        { key: "cilia_positive", label: "ciliated cells / total cells", representation: "proportion_counts", componentLabels: ["ciliated cells", "total cells"] },
      ],
    });
    assert.equal(canvas.conditionCells[1]?.status, "not_performed_by_design");
    assert.deepEqual(canvas.dimensions[0]?.values.map((value) => value.key), ["control", "gene_a_1"]);
    assert.equal(canvas.dimensions[0]?.values[1]?.groupKey, "gene_a");
  });

  it("allows a summary graph before asking statistics-only questions", () => {
    const graph = evaluateReadiness(graphFacts, { capability: "structured_graph", graphForm: "summary" });
    assert.equal(graph.status, "READY");
    assert.ok(graph.deferred.includes("experimental_unit"));
    assert.ok(graph.deferred.includes("independent_replication"));
  });

  it("asks for identity only when the requested graph needs it", () => {
    const graph = evaluateReadiness(graphFacts, { capability: "structured_graph", graphForm: "paired_lines" });
    assert.equal(graph.status, "NEED_MORE_INFORMATION");
    assert.equal(nextTargetedQuestion(graph), "graph_identity");
    assert.ok(!graph.askNow.includes("experimental_unit"));
  });

  it("opens statistics with only the missing semantic facts", () => {
    const result = evaluateReadiness(graphFacts, {
      capability: "statistics",
      usesLowerObservations: true,
      hasActualMissingness: true,
      requiresComparisonChoice: true,
    });
    assert.equal(result.status, "NEED_MORE_INFORMATION");
    assert.deepEqual(result.askNow, [
      "experimental_unit",
      "assignment_receiver",
      "source_and_split_lineage",
      "independent_replication",
      "observation_hierarchy",
      "missingness_meaning",
      "comparison_scope",
    ]);
  });

  it("does not turn an irrecoverable paired identity into an independent analysis", () => {
    const result = evaluateReadiness(
      [
        ...graphFacts,
        { key: "experimental_unit", state: "known", source: "researcher_answer" },
        { key: "assignment_receiver", state: "known", source: "researcher_answer" },
        { key: "source_and_split_lineage", state: "known", source: "researcher_answer" },
        { key: "independent_replication", state: "known", source: "researcher_answer" },
        { key: "matching_identity", state: "irrecoverable", source: "data_mapping" },
      ],
      { capability: "statistics", hasMatchedOrRepeatedConditions: true, requiresComparisonChoice: false },
    );
    const pairedGraph = evaluateReadiness(
      [...graphFacts, { key: "graph_identity", state: "irrecoverable", source: "data_mapping" }],
      { capability: "structured_graph", graphForm: "paired_lines" },
    );
    assert.equal(pairedGraph.status, "SAFE_UNSUPPORTED");
    assert.equal(result.status, "SAFE_UNSUPPORTED");
    assert.deepEqual(result.blockingFacts, ["matching_identity"]);
  });

  it("requires executed settings only when Methods are requested", () => {
    const completeForStatistics: EntryFact[] = [
      ...graphFacts,
      { key: "experimental_unit", state: "known", source: "researcher_answer" },
      { key: "assignment_receiver", state: "known", source: "researcher_answer" },
      { key: "source_and_split_lineage", state: "known", source: "researcher_answer" },
      { key: "independent_replication", state: "known", source: "researcher_answer" },
    ];
    assert.equal(evaluateReadiness(completeForStatistics, { capability: "statistics" }).status, "READY");
    const methods = evaluateReadiness(completeForStatistics, { capability: "methods" });
    assert.equal(methods.status, "NEED_MORE_INFORMATION");
    assert.deepEqual(methods.askNow, ["executed_analysis"]);
  });

  it("keeps all 65 Gold cases graph-ready before statistics-only facts are collected", () => {
    const root = resolve(process.cwd(), "../..");
    const gold = loadGoldSet(
      resolve(root, "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first/stress/gold-set-65.json"),
    );
    assert.equal(gold.cases.length, 65);
    for (const item of gold.cases) {
      const contract = compileGoldCase(item);
      const graph = evaluateReadiness(graphStageFacts(contract), graphRequestFor(contract));
      assert.equal(graph.status, "READY", `${item.case_id}: ${graph.askNow.join(",")}`);
      const statistics = evaluateReadiness(completeStructureFacts(contract), statisticsRequestFor(contract));
      assert.equal(statistics.status, "READY", `${item.case_id}: ${statistics.askNow.join(",")}`);
    }
  });
});
