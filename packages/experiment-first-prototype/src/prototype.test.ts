import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileGoldCase } from "./compiler.ts";
import { evaluateGoldSet, loadGoldSet } from "./evaluation.ts";
import { mapRawText, RAW_MAPPING_SPECS } from "./raw-import.ts";
import { generatePrototypePayload, renderSurfaceHtml, selectSurface, validatePayload } from "./surfaces.ts";
import { STRESS_CASES } from "./stress-cases.ts";
import { ADVERSARIAL_DESCRIPTIONS, evaluateAdversarialDescription } from "./adversarial.ts";

const root = resolve(process.cwd(), "../..");
const experimentFirstRoot = resolve(root, "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first");
const gold = loadGoldSet(resolve(experimentFirstRoot, "gold-set-45.json"));

describe("experiment-first adaptive prototype", () => {
  it("compiles all 45 Gold cases into valid contracts and payloads", () => {
    const run = evaluateGoldSet(gold);
    assert.equal(run.caseCount, 45);
    assert.equal(run.successRate, 1, JSON.stringify(run.cases.filter((item) => !item.success), null, 2));
  });

  it("selects all five generic surfaces", () => {
    const surfaces = new Set(gold.cases.map((item) => selectSurface(compileGoldCase(item)).surfaceId));
    assert.deepEqual([...surfaces].sort(), [
      "compact_unit_matrix",
      "factor_observation_table",
      "nested_observation_table",
      "repeated_axis_matrix",
      "typed_record_table",
    ]);
  });

  it("passes the 20-case boundary stress expansion without changing the historical 45", () => {
    const combined = { version: "1.1.0-stress", case_count: 65, cases: [...gold.cases, ...STRESS_CASES] };
    const run = evaluateGoldSet(combined);
    assert.equal(STRESS_CASES.length, 20);
    assert.equal(run.caseCount, 65);
    assert.equal(run.successRate, 1, JSON.stringify(run.cases.filter((item) => !item.success), null, 2));
  });

  it("generates accessible table markup for every surface", () => {
    for (const item of gold.cases) {
      const contract = compileGoldCase(item);
      const payload = generatePrototypePayload(contract);
      assert.deepEqual(validatePayload(contract, payload), []);
      const html = renderSurfaceHtml(contract, payload);
      assert.ok(html.includes('aria-labelledby='));
      assert.ok(html.includes('<th scope="col">'));
    }
  });

  it("maps all twelve messy raw examples with generic mapping primitives", () => {
    for (const spec of RAW_MAPPING_SPECS) {
      const text = readFileSync(resolve(experimentFirstRoot, "raw-realism", spec.file), "utf8");
      const result = mapRawText(text, spec);
      assert.equal(result.success, true, `${spec.file}: ${result.warnings.join(",")}`);
      assert.ok(result.mappedRows > 0);
    }
  });

  it("asks only semantic-changing questions for adversarial description variants", () => {
    const results = ADVERSARIAL_DESCRIPTIONS.map(evaluateAdversarialDescription);
    assert.equal(results.length, 16);
    for (const [index, result] of results.entries()) {
      const style = ADVERSARIAL_DESCRIPTIONS[index]!.style;
      if (style === "ambiguous") assert.equal(result.status, "HUMAN_DECISION_REQUIRED");
      else {
        assert.equal(result.status, "RESOLVED");
        assert.equal(result.questionsShown, 0);
      }
    }
  });

  it("preserves per-readout missingness without dropping sibling readouts", () => {
    const item = STRESS_CASES.find((candidate) => candidate.case_id === "EFS-049")!;
    const contract = compileGoldCase(item);
    const payload = generatePrototypePayload(contract);
    const row = payload.rows[0]!;
    row.values.cxcl1 = null;
    row.missingness = { cxcl1: "assay_failed" };
    assert.deepEqual(validatePayload(contract, payload), []);
    assert.notEqual(row.values.il_6, null);
    assert.notEqual(row.values.tnf_alpha, null);
  });
});
