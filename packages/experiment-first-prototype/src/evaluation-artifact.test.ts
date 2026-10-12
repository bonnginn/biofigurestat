import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { it } from "node:test";
import { evaluateGoldSet, loadExistingOperationEvidence, loadGoldSet } from "./evaluation.ts";
import { mapRawText, RAW_MAPPING_SPECS } from "./raw-import.ts";
import { STRESS_CASES } from "./stress-cases.ts";
import { ADVERSARIAL_DESCRIPTIONS, evaluateAdversarialDescription } from "./adversarial.ts";
import { compileGoldCase } from "./compiler.ts";
import { planMinimalInterview } from "./questions.ts";
import { generatePrototypePayload, selectSurface } from "./surfaces.ts";

// Explicit evidence writer. Keep this file out of the default regression command;
// run it only when regeneration of the historical JSON/HTML artifacts is intended.
it("writes the current prototype evaluation artifacts", () => {
  const root = resolve(process.cwd(), "../..");
  const evaluationRoot = resolve(root, "docs/evaluation/experiment-to-structure-navigation-pilot");
  const experimentFirstRoot = resolve(evaluationRoot, "experiment-first");
  const outputDir = resolve(experimentFirstRoot, "prototype-runs");
  mkdirSync(outputDir, { recursive: true });
  const gold = loadGoldSet(resolve(experimentFirstRoot, "gold-set-45.json"));
  const operations = loadExistingOperationEvidence(resolve(evaluationRoot, "case-drafts/batch-01-input-surface-assessment.json"));
  const run = evaluateGoldSet(gold, operations);
  const combinedGold = { version: "1.1.0-stress", case_count: 65, pool_d_accessed: false, cases: [...gold.cases, ...STRESS_CASES] };
  const stressRun = evaluateGoldSet(combinedGold, operations);
  const rawResults = RAW_MAPPING_SPECS.map((spec) => {
    const text = readFileSync(resolve(experimentFirstRoot, "raw-realism", spec.file), "utf8");
    const result = mapRawText(text, spec);
    return { ...result, normalizedRows: result.normalizedRows.slice(0, 5) };
  });
  const caseTraces = combinedGold.cases.map((item) => {
    const contract = compileGoldCase(item);
    const interview = planMinimalInterview(item, contract);
    const surfaceSelection = selectSurface(contract);
    const inputPayload = generatePrototypePayload(contract, surfaceSelection);
    return {
      caseId: item.case_id,
      experimentDescription: item.experiment_description,
      minimalBiologicalQuestions: interview,
      structureContract: contract,
      surfaceSelection,
      inputPayload,
      internalDesignRepresentation: contract,
    };
  });
  const report = {
    prototype: { ...stressRun, previewHtml: undefined },
    adversarial: {
      variantCount: ADVERSARIAL_DESCRIPTIONS.length,
      results: ADVERSARIAL_DESCRIPTIONS.map((item) => ({ ...item, evaluation: evaluateAdversarialDescription(item) })),
    },
    messyRaw: {
      caseCount: rawResults.length,
      successCount: rawResults.filter((result) => result.success).length,
      successRate: rawResults.filter((result) => result.success).length / rawResults.length,
      totalTargetedConfirmations: rawResults.reduce((sum, result) => sum + result.targetedConfirmations.length, 0),
      results: rawResults,
    },
  };
  const stressDir = resolve(experimentFirstRoot, "stress");
  mkdirSync(stressDir, { recursive: true });
  writeFileSync(resolve(stressDir, "stress-set-20.json"), JSON.stringify({ version: "1.0.0", case_count: 20, pool_d_accessed: false, cases: STRESS_CASES }, null, 2));
  writeFileSync(resolve(stressDir, "gold-set-65.json"), JSON.stringify(combinedGold, null, 2));
  writeFileSync(resolve(outputDir, "case-traces-65.json"), JSON.stringify({ version: "1.0.0", caseCount: 65, traces: caseTraces }, null, 2));
  writeFileSync(resolve(outputDir, "raw-mapping-evidence-12.json"), JSON.stringify({ version: "1.0.0", caseCount: 12, results: rawResults }, null, 2));
  writeFileSync(resolve(outputDir, "cycle-current.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(outputDir, "cycle-current-surfaces.html"), stressRun.previewHtml);
  writeFileSync(resolve(outputDir, "cycle-05-row-grain-refined-65.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(outputDir, "cycle-05-row-grain-refined-surfaces.html"), stressRun.previewHtml);
  assert.equal(run.caseCount, 45);
  assert.equal(stressRun.successRate, 1);
});
