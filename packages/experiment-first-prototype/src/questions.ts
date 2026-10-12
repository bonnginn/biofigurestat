import type { GoldCase } from "./gold-types.ts";
import type { StructureContract } from "./contract.ts";

export type QuestionDisposition = "required" | "inferred_safely" | "targeted_confirmation" | "redundant";

export interface QuestionTraceItem {
  key: string;
  disposition: QuestionDisposition;
  reason: string;
  changesSemanticStructure: boolean;
}

export interface InterviewTrace {
  caseId: string;
  questionsShown: number;
  requiredQuestions: string[];
  inferredSafely: string[];
  targetedConfirmations: string[];
  redundantQuestions: string[];
  humanDecisionRequired: string[];
  trace: QuestionTraceItem[];
}

export function planMinimalInterview(gold: GoldCase, contract: StructureContract): InterviewTrace {
  const trace: QuestionTraceItem[] = [];
  const add = (item: QuestionTraceItem) => trace.push(item);

  add({
    key: "experimental_unit",
    disposition: "required",
    reason: "The entity carrying independent biological n must be explicit even when treatment recipients are described.",
    changesSemanticStructure: true,
  });
  add({
    key: "measurement_bundle",
    disposition: "inferred_safely",
    reason: "The Gold description names the readout and its raw component form.",
    changesSemanticStructure: true,
  });
  add({
    key: "factor_names_and_levels",
    disposition: "inferred_safely",
    reason: "Named interventions, states, genotypes, and ordered levels are explicit in the experiment description.",
    changesSemanticStructure: true,
  });

  const hasLowerHierarchy = contract.unitLevels.some(
    (level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block",
  );
  if (hasLowerHierarchy) {
    add({
      key: "assignment_unit_vs_sampled_inside",
      disposition: "inferred_safely",
      reason: "The required experimental-unit answer fixes biological n; named lower IDs can then be retained as child levels without another question.",
      changesSemanticStructure: true,
    });
  } else {
    add({
      key: "assignment_unit_vs_sampled_inside",
      disposition: "redundant",
      reason: "No lower observation level is present.",
      changesSemanticStructure: false,
    });
  }

  const complexRelationship = ["blocked", "mixed", "crossover"].includes(contract.matching.kind);
  const identityChangesDesign =
    contract.matching.kind !== "independent" ||
    contract.factors.some((factor) => factor.unitRole === "within_unit") ||
    contract.orderedAxes.some((axis) => axis.identityRetained);
  const explicitIdentityReuse = /同じ|同一|追跡|保持|両時点|両条件|same|within|matched/i.test(gold.experiment_description);
  if (complexRelationship) {
    add({
      key: "factor_or_block_relationship",
      disposition: "targeted_confirmation",
      reason: "Block, mixed within/between, and crossover roles change the relationship graph even when the factor names are known.",
      changesSemanticStructure: true,
    });
  } else if (identityChangesDesign && explicitIdentityReuse) {
    add({
      key: "same_identity_across_conditions_or_axis",
      disposition: "inferred_safely",
      reason: "The description explicitly states that the same named identity is retained.",
      changesSemanticStructure: true,
    });
  } else if (identityChangesDesign) {
    add({
      key: "same_identity_across_conditions_or_axis",
      disposition: "targeted_confirmation",
      reason: "The answer distinguishes independent rows from matching or repeated measurement.",
      changesSemanticStructure: true,
    });
  } else {
    add({
      key: "same_identity_across_conditions_or_axis",
      disposition: "inferred_safely",
      reason: "The description explicitly uses different units and contains no reused identity.",
      changesSemanticStructure: true,
    });
  }

  const incomplete =
    contract.matching.completeSetsRequired === false ||
    /dropout|missing|測定不能|欠測|得られず|採取できなかった|なかった個体|除外しなかった/.test(gold.experiment_description);
  if (incomplete) {
    add({
      key: "missingness_reason",
      disposition: "targeted_confirmation",
      reason: "Structural absence, assay failure, dropout, and censoring produce different contracts.",
      changesSemanticStructure: true,
    });
  } else {
    add({
      key: "missingness_reason",
      disposition: "redundant",
      reason: "The described observation set is complete.",
      changesSemanticStructure: false,
    });
  }

  if (contract.orderedAxes.length > 1) {
    add({
      key: "identity_across_each_axis",
      disposition: "targeted_confirmation",
      reason: "Identity may persist across one axis but not another.",
      changesSemanticStructure: true,
    });
  } else {
    add({
      key: "identity_across_each_axis",
      disposition: "redundant",
      reason: "There is at most one ordered axis.",
      changesSemanticStructure: false,
    });
  }

  add({
    key: "choose_paired_statistical_term",
    disposition: "redundant",
    reason: "Pairing is derived from concrete identity reuse, not statistical vocabulary.",
    changesSemanticStructure: false,
  });
  add({
    key: "choose_input_table_shape",
    disposition: "redundant",
    reason: "The surface is compiled from the structure contract.",
    changesSemanticStructure: false,
  });

  const by = (disposition: QuestionDisposition) => trace.filter((item) => item.disposition === disposition).map((item) => item.key);
  return {
    caseId: gold.case_id,
    questionsShown: by("required").length + by("targeted_confirmation").length,
    requiredQuestions: by("required"),
    inferredSafely: by("inferred_safely"),
    targetedConfirmations: by("targeted_confirmation"),
    redundantQuestions: by("redundant"),
    humanDecisionRequired: [],
    trace,
  };
}
