import { readFileSync } from "node:fs";
import { compileGoldCase } from "./compiler.ts";
import type { GoldCase, GoldSet } from "./gold-types.ts";
import { planMinimalInterview } from "./questions.ts";
import {
  generatePrototypePayload,
  measureAdaptiveBurden,
  renderSurfaceHtml,
  selectSurface,
  validatePayload,
  type InputBurden,
} from "./surfaces.ts";
import type { StructureContract } from "./contract.ts";

export interface CaseEvaluation {
  caseId: string;
  success: boolean;
  failures: string[];
  selectedSurface: string;
  expectedSurface: string;
  payloadRows: number;
  questionsShown: number;
  requiredQuestions: string[];
  inferredSafely: string[];
  targetedConfirmations: string[];
  redundantQuestionsRemoved: string[];
  adaptiveBurden: InputBurden;
  currentBurden: InputBurden & { evidence: string };
  internalDesign: {
    experimentalUnitLevelKey: string;
    identityCount: number;
    factorCount: number;
    orderedAxisCount: number;
    unitLevelCount: number;
    readoutCount: number;
    readoutRepresentation: string;
  };
}

export interface EvaluationRun {
  runVersion: string;
  caseCount: number;
  successCount: number;
  successRate: number;
  meanQuestionsShown: number;
  targetedConfirmationCaseCount: number;
  targetedConfirmationRate: number;
  surfaceCoverage: Record<string, { cases: number; successes: number }>;
  burdenTotals: { current: InputBurden; adaptive: InputBurden };
  cases: CaseEvaluation[];
  previewHtml: string;
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

function losslessFailures(gold: GoldCase, contract: StructureContract): string[] {
  const failures: string[] = [];
  const compiledUnit = normalize(contract.unitLevels.find((level) => level.key === contract.experimentalUnitLevelKey)?.label ?? "");
  const goldUnit = normalize(gold.true_experimental_unit);
  if (compiledUnit !== goldUnit && !goldUnit.includes(compiledUnit) && !compiledUnit.includes(goldUnit)) {
    failures.push("experimental_unit_loss");
  }
  const identityLabels = new Set(contract.identities.map((identity) => identity.label));
  for (const identity of gold.identities) if (!identityLabels.has(identity)) failures.push(`identity_loss:${identity}`);
  for (const goldFactor of gold.factors_conditions) {
    const factor = contract.factors.find((candidate) => candidate.label === goldFactor.name);
    if (!factor) failures.push(`factor_loss:${goldFactor.name}`);
    else {
      if (factor.unitRole !== goldFactor.unit_role) failures.push(`factor_role_loss:${goldFactor.name}`);
      if (JSON.stringify(factor.levels) !== JSON.stringify(goldFactor.levels)) failures.push(`factor_level_loss:${goldFactor.name}`);
    }
  }
  if (contract.orderedAxes.length !== gold.ordered_axes.length) failures.push("ordered_axis_count_loss");
  for (const axis of gold.ordered_axes) {
    const compiled = contract.orderedAxes.find((candidate) => candidate.label === axis.name);
    if (!compiled) failures.push(`ordered_axis_loss:${axis.name}`);
    else if (compiled.identityRetained !== axis.identity_retained) failures.push(`axis_identity_loss:${axis.name}`);
  }
  for (const level of gold.nested_structure) {
    if (!contract.unitLevels.some((candidate) => normalize(candidate.label) === normalize(level.level))) failures.push(`hierarchy_loss:${level.level}`);
  }
  const goldReadouts = gold.expected_internal_design.measurements;
  if (contract.readouts.length !== goldReadouts.length) failures.push("readout_count_loss");
  for (const goldReadout of goldReadouts) {
    const compiled = contract.readouts.find((candidate) => candidate.label === goldReadout.name);
    if (!compiled) failures.push(`readout_loss:${goldReadout.name}`);
    else {
      if (goldReadout.observation_level) {
        const observationLevel = contract.unitLevels.find((level) => level.key === compiled.observationLevelKey);
        if (normalize(observationLevel?.label ?? "") !== normalize(goldReadout.observation_level)) {
          failures.push(`readout_observation_level_loss:${goldReadout.name}`);
        }
      }
      if (goldReadout.axis_names) {
        const expected = goldReadout.axis_names.map(normalize).sort();
        const actual = compiled.axisKeys
          .map((key) => normalize(contract.orderedAxes.find((axis) => axis.key === key)?.label ?? key))
          .sort();
        if (JSON.stringify(expected) !== JSON.stringify(actual)) failures.push(`readout_axis_binding_loss:${goldReadout.name}`);
      }
    }
  }
  return failures;
}

const emptyBurden = (): InputBurden => ({
  manualCellOperations: 0,
  pasteOperations: 0,
  screenContextSwitches: 0,
  requiredPreprocessingSteps: 0,
  identityReentryOperations: 0,
  workaroundOperations: 0,
  informationLossFields: 0,
});

function currentBurden(gold: GoldCase, operationEvidence: Map<string, number>): InputBurden & { evidence: string } {
  const exact = operationEvidence.get(gold.case_id);
  const reach = gold.architecture_a_current.correct_structure_reachable;
  const estimated = exact ?? (reach === "yes" ? 8 : reach === "partial" ? 40 : 80);
  return {
    manualCellOperations: gold.architecture_a_current.input_load === "low" ? 0 : estimated,
    pasteOperations: gold.architecture_a_current.input_load === "low" ? 1 : 0,
    screenContextSwitches: reach === "yes" ? 2 : 4,
    requiredPreprocessingSteps: reach === "no" ? 1 : reach === "partial" ? 1 : 0,
    identityReentryOperations: reach === "yes" ? 0 : Math.min(gold.identities.length, 2),
    workaroundOperations: reach === "yes" ? 0 : reach === "partial" ? 1 : 2,
    informationLossFields: reach === "no" ? Math.max(1, gold.identities.length - 1) : reach === "partial" ? 1 : 0,
    evidence: exact === undefined ? "architecture_screening_estimate" : "existing_15_assessment_or_manual_evidence",
  };
}

function sumBurden(items: InputBurden[]): InputBurden {
  return items.reduce((total, item) => {
    for (const key of Object.keys(total) as Array<keyof InputBurden>) total[key] += item[key];
    return total;
  }, emptyBurden());
}

export function loadGoldSet(path: string): GoldSet {
  return JSON.parse(readFileSync(path, "utf8")) as GoldSet;
}

export function loadExistingOperationEvidence(path: string): Map<string, number> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    assessments: Array<{ case_id: string; input_surface_fit: { estimated_user_operations: number } }>;
  };
  return new Map(parsed.assessments.map((assessment) => [assessment.case_id, assessment.input_surface_fit.estimated_user_operations]));
}

export function evaluateGoldSet(goldSet: GoldSet, operationEvidence = new Map<string, number>()): EvaluationRun {
  const cases: CaseEvaluation[] = [];
  const previewBySurface = new Map<string, string>();
  for (const gold of goldSet.cases) {
    const failures: string[] = [];
    let contract: StructureContract;
    try {
      contract = compileGoldCase(gold);
    } catch (error) {
      cases.push({
        caseId: gold.case_id,
        success: false,
        failures: [`contract_validation:${error instanceof Error ? error.message : String(error)}`],
        selectedSurface: "contract_failed",
        expectedSurface: gold.natural_input_surface.surface_id,
        payloadRows: 0,
        questionsShown: 0,
        requiredQuestions: [],
        inferredSafely: [],
        targetedConfirmations: [],
        redundantQuestionsRemoved: [],
        adaptiveBurden: emptyBurden(),
        currentBurden: currentBurden(gold, operationEvidence),
        internalDesign: { experimentalUnitLevelKey: "", identityCount: 0, factorCount: 0, orderedAxisCount: 0, unitLevelCount: 0, readoutCount: 0, readoutRepresentation: "" },
      });
      continue;
    }
    const interview = planMinimalInterview(gold, contract);
    const selection = selectSurface(contract);
    if (selection.surfaceId !== gold.natural_input_surface.surface_id) failures.push("surface_selection_mismatch");
    const payload = generatePrototypePayload(contract, selection);
    failures.push(...validatePayload(contract, payload));
    failures.push(...losslessFailures(gold, contract));
    if (!previewBySurface.has(selection.surfaceId)) previewBySurface.set(selection.surfaceId, renderSurfaceHtml(contract, payload));
    cases.push({
      caseId: gold.case_id,
      success: failures.length === 0,
      failures: [...new Set(failures)],
      selectedSurface: selection.surfaceId,
      expectedSurface: gold.natural_input_surface.surface_id,
      payloadRows: payload.rows.length,
      questionsShown: interview.questionsShown,
      requiredQuestions: interview.requiredQuestions,
      inferredSafely: interview.inferredSafely,
      targetedConfirmations: interview.targetedConfirmations,
      redundantQuestionsRemoved: interview.redundantQuestions,
      adaptiveBurden: measureAdaptiveBurden(payload),
      currentBurden: currentBurden(gold, operationEvidence),
      internalDesign: {
        experimentalUnitLevelKey: contract.experimentalUnitLevelKey,
        identityCount: contract.identities.length,
        factorCount: contract.factors.length,
        orderedAxisCount: contract.orderedAxes.length,
        unitLevelCount: contract.unitLevels.length,
        readoutCount: contract.readouts.length,
        readoutRepresentation: contract.readouts[0]!.representation,
      },
    });
  }
  const surfaceCoverage: EvaluationRun["surfaceCoverage"] = {};
  for (const item of cases) {
    surfaceCoverage[item.selectedSurface] ??= { cases: 0, successes: 0 };
    surfaceCoverage[item.selectedSurface]!.cases++;
    if (item.success) surfaceCoverage[item.selectedSurface]!.successes++;
  }
  const successCount = cases.filter((item) => item.success).length;
  const targeted = cases.filter((item) => item.targetedConfirmations.length > 0).length;
  return {
    runVersion: "0.1.0",
    caseCount: cases.length,
    successCount,
    successRate: cases.length ? successCount / cases.length : 0,
    meanQuestionsShown: cases.reduce((sum, item) => sum + item.questionsShown, 0) / Math.max(cases.length, 1),
    targetedConfirmationCaseCount: targeted,
    targetedConfirmationRate: targeted / Math.max(cases.length, 1),
    surfaceCoverage,
    burdenTotals: {
      current: sumBurden(cases.map((item) => item.currentBurden)),
      adaptive: sumBurden(cases.map((item) => item.adaptiveBurden)),
    },
    cases,
    previewHtml: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Experiment-first adaptive surfaces</title><style>body{font-family:system-ui;margin:2rem}section{margin:2rem 0;overflow:auto}table{border-collapse:collapse}th,td{border:1px solid #bbb;padding:.35rem .55rem;text-align:left}th{background:#f1f4f7}</style></head><body><h1>Five adaptive input surfaces</h1>${[...previewBySurface.values()].join("")}</body></html>`,
  };
}
