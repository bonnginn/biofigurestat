import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./ids";

export const DESIGN_SCHEMA_VERSION = "0.2.0" as const;

export const ExperimentPurposeSchema = z.enum([
  "western_blot",
  "microscopy",
  "animal",
  "mass_spectrometry",
  "general_assay",
  "time_or_dose",
  "custom",
]);

export const OutcomeTypeSchema = z.enum([
  "continuous",
  "count",
  "percentage",
  "proportion_counts",
  "categorical_counts",
  "binary",
  "time",
  "time_to_event",
]);

export const OutcomeDefinitionSchema = z.object({
  id: EntityIdSchema,
  key: EntityIdSchema,
  label: z.string().min(1),
  type: OutcomeTypeSchema,
  unit: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const FactorLevelSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  groupId: EntityIdSchema.optional(),
});

/**
 * A scientific grouping of intervention levels, such as three independent
 * siRNA sequences targeting the same gene. Group membership never turns the
 * member levels into biological replicates.
 */
export const FactorLevelGroupSchema = z.object({
  id: EntityIdSchema,
  key: EntityIdSchema,
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const FactorDefinitionSchema = z
  .object({
    id: EntityIdSchema,
    key: EntityIdSchema,
    label: z.string().min(1),
    levelGroups: z.array(FactorLevelGroupSchema).optional(),
    levels: z.array(FactorLevelSchema).min(2),
  })
  .superRefine((factor, ctx) => {
    const groups = factor.levelGroups ?? [];
    const groupIds = new Set<string>();
    groups.forEach((group, index) => {
      if (groupIds.has(group.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["levelGroups", index, "id"],
          message: "Factor level-group IDs must be unique",
        });
      }
      groupIds.add(group.id);
    });
    factor.levels.forEach((level, index) => {
      if (level.groupId && !groupIds.has(level.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["levels", index, "groupId"],
          message: "Factor level references an unknown scientific group",
        });
      }
    });
  });

export const ConditionDefinitionSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  factorLevels: z.record(EntityIdSchema, EntityIdSchema),
});

export const UnitRoleSchema = z.enum([
  "experimental_unit",
  "block",
  "subsample",
  "technical_replicate",
]);

export const UnitLevelDefinitionSchema = z.object({
  id: EntityIdSchema,
  key: EntityIdSchema,
  label: z.string().min(1),
  role: UnitRoleSchema,
  parentLevelId: EntityIdSchema.nullable(),
});

const IndependentPairingSchema = z.object({
  kind: z.literal("independent"),
});

const MatchedPairingSchema = z.object({
  kind: z.literal("matched"),
  matchLevelId: EntityIdSchema,
  completePairsRequired: z.boolean().default(true),
});

const BlockedPairingSchema = z.object({
  kind: z.literal("blocked"),
  blockLevelId: EntityIdSchema,
  completePairsRequired: z.boolean().default(true),
  explicitlyRequested: z.literal(true),
});

export const PairingDefinitionSchema = z.discriminatedUnion("kind", [
  IndependentPairingSchema,
  MatchedPairingSchema,
  BlockedPairingSchema,
]);

export const NormalizationPlanSchema = z.object({
  id: EntityIdSchema,
  method: z.enum([
    "none",
    "loading_control",
    "baseline",
    "control_equals_one",
    "per_unit_maximum",
    "custom",
  ]),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const PrimaryContrastSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  conditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
});

export const WizardDecisionSchema = z.object({
  questionId: EntityIdSchema,
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const ExperimentDesignSchema = z
  .object({
    schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
    id: EntityIdSchema,
    name: z.string().min(1),
    purpose: ExperimentPurposeSchema,
    outcomes: z.array(OutcomeDefinitionSchema).min(1),
    factors: z.array(FactorDefinitionSchema).min(1),
    conditions: z.array(ConditionDefinitionSchema).min(2),
    unitLevels: z.array(UnitLevelDefinitionSchema).min(1),
    experimentalUnitLevelId: EntityIdSchema,
    pairing: PairingDefinitionSchema,
    plannedN: z.number().int().positive(),
    normalizationPlans: z.array(NormalizationPlanSchema).default([]),
    primaryContrast: PrimaryContrastSchema,
    wizardRuleVersion: z.string().min(1),
    wizardDecisions: z.array(WizardDecisionSchema),
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((design, ctx) => {
    const levelById = new Map(design.unitLevels.map((level) => [level.id, level]));
    if (levelById.size !== design.unitLevels.length) {
      ctx.addIssue({
        code: "custom",
        path: ["unitLevels"],
        message: "Unit level IDs must be unique",
      });
    }
    design.unitLevels.forEach((level, index) => {
      if (level.parentLevelId !== null && !levelById.has(level.parentLevelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["unitLevels", index, "parentLevelId"],
          message: "Unit level references an unknown parent level",
        });
      }
      const visited = new Set<string>();
      let current: typeof level | undefined = level;
      while (current) {
        if (visited.has(current.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["unitLevels", index, "parentLevelId"],
            message: "Unit level hierarchy must not contain a cycle",
          });
          break;
        }
        visited.add(current.id);
        current = current.parentLevelId ? levelById.get(current.parentLevelId) : undefined;
      }
    });
    const experimentalLevel = levelById.get(design.experimentalUnitLevelId);
    if (!experimentalLevel || experimentalLevel.role !== "experimental_unit") {
      ctx.addIssue({
        code: "custom",
        path: ["experimentalUnitLevelId"],
        message: "experimentalUnitLevelId must reference an experimental_unit level",
      });
    }

    const conditionIds = new Set(design.conditions.map((condition) => condition.id));
    for (const [index, conditionId] of design.primaryContrast.conditionIds.entries()) {
      if (!conditionIds.has(conditionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["primaryContrast", "conditionIds", index],
          message: "Primary contrast references an unknown condition",
        });
      }
    }

    if (design.pairing.kind === "matched" && !levelById.has(design.pairing.matchLevelId)) {
      ctx.addIssue({
        code: "custom",
        path: ["pairing", "matchLevelId"],
        message: "Matched design references an unknown unit level",
      });
    }

    if (design.pairing.kind === "blocked" && !levelById.has(design.pairing.blockLevelId)) {
      ctx.addIssue({
        code: "custom",
        path: ["pairing", "blockLevelId"],
        message: "Blocked design references an unknown unit level",
      });
    }
  });

export type ExperimentDesign = z.infer<typeof ExperimentDesignSchema>;
export type PairingDefinition = z.infer<typeof PairingDefinitionSchema>;
