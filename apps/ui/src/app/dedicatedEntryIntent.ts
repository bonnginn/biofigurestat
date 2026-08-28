import type { EntryModuleFacts, EntryModuleId } from "@lsaa/adaptive-input";

import type { ExperimentContext } from "./experimentDraft";
import type { AppRoute } from "./routes";

export const DEDICATED_ENTRY_INTENT_VERSION = "0.1.0" as const;
export const DEDICATED_ENTRY_HISTORY_STATE_KEY = "lsaaDedicatedEntryIntent" as const;

export type DedicatedEntryModuleId = Extract<
  EntryModuleId,
  "time_to_event" | "ordered_curve_kinetics" | "matrix_visualization"
>;

export type DedicatedEntryIntent = Readonly<{
  schemaVersion: typeof DEDICATED_ENTRY_INTENT_VERSION;
  moduleId: DedicatedEntryModuleId;
  destination: Extract<AppRoute, "survival" | "nonlinear-fit" | "heatmap">;
  sourceContext: Exclude<ExperimentContext, "existing_data">;
  entryRouteId: string;
  experimentName: string;
  experimentDescription: string;
  subjectUnitLabel: string;
  facts: EntryModuleFacts;
}>;

/**
 * Dedicated entry intent is a one-route handoff, not persistent project state.
 * Leaving its destination consumes it so returning through a legacy analysis
 * switcher cannot silently reapply an earlier experiment assumption.
 */
export function dedicatedEntryIntentForRoute(
  intent: DedicatedEntryIntent | null,
  route: AppRoute,
): DedicatedEntryIntent | null {
  return intent?.destination === route ? intent : null;
}

/**
 * Keeps the direct-entry choice attached to its browser history entry. This is
 * deliberately not project persistence: it only lets a reload return to the
 * same empty, safe specialist entry instead of falling back to a legacy demo.
 */
export function dedicatedEntryHistoryState(
  intent: DedicatedEntryIntent,
): Readonly<Record<string, unknown>> {
  return { [DEDICATED_ENTRY_HISTORY_STATE_KEY]: intent };
}

export function dedicatedEntryIntentFromHistoryState(
  state: unknown,
  route: AppRoute,
): DedicatedEntryIntent | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const candidate = (state as Record<string, unknown>)[DEDICATED_ENTRY_HISTORY_STATE_KEY];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  const moduleIds: readonly DedicatedEntryModuleId[] = [
    "time_to_event",
    "ordered_curve_kinetics",
    "matrix_visualization",
  ];
  const destinations: readonly DedicatedEntryIntent["destination"][] = [
    "survival",
    "nonlinear-fit",
    "heatmap",
  ];
  const sourceContexts: readonly DedicatedEntryIntent["sourceContext"][] = [
    "cell_culture",
    "microscopy_imaging",
    "protein_biochemical",
    "animal",
    "general_assay",
  ];
  if (
    record.schemaVersion !== DEDICATED_ENTRY_INTENT_VERSION ||
    typeof record.moduleId !== "string" ||
    !moduleIds.includes(record.moduleId as DedicatedEntryModuleId) ||
    typeof record.destination !== "string" ||
    !destinations.includes(record.destination as DedicatedEntryIntent["destination"]) ||
    typeof record.sourceContext !== "string" ||
    !sourceContexts.includes(record.sourceContext as DedicatedEntryIntent["sourceContext"]) ||
    typeof record.entryRouteId !== "string" ||
    !record.entryRouteId.trim() ||
    typeof record.experimentName !== "string" ||
    !record.experimentName.trim() ||
    typeof record.experimentDescription !== "string" ||
    !record.experimentDescription.trim()
  ) {
    return null;
  }
  try {
    const restored = createDedicatedEntryIntent({
      moduleId: record.moduleId as DedicatedEntryModuleId,
      destination: record.destination as DedicatedEntryIntent["destination"],
      sourceContext: record.sourceContext as DedicatedEntryIntent["sourceContext"],
      entryRouteId: record.entryRouteId,
      experimentName: record.experimentName,
      experimentDescription: record.experimentDescription,
    });
    return dedicatedEntryIntentForRoute(restored, route);
  } catch {
    return null;
  }
}

const subjectLabelFor = (
  context: DedicatedEntryIntent["sourceContext"],
  moduleId: DedicatedEntryModuleId,
): string => {
  if (moduleId === "time_to_event") {
    if (context === "animal") return "Animal";
    if (context === "cell_culture") return "Cell";
    return "Subject";
  }
  if (moduleId === "matrix_visualization") return "Matrix column (not a biological unit)";
  if (context === "protein_biochemical") return "Reaction / experimental run";
  if (context === "animal") return "Animal / experimental unit";
  return "Experimental unit";
};

/**
 * Converts an explicit researcher-facing shortcut into a versioned semantic
 * handoff. Selecting a dedicated surface never supplies facts that the entry
 * choice did not establish.
 */
export function createDedicatedEntryIntent(
  input: Readonly<{
    moduleId: DedicatedEntryModuleId;
    destination: DedicatedEntryIntent["destination"];
    sourceContext: DedicatedEntryIntent["sourceContext"];
    entryRouteId: string;
    experimentName: string;
    experimentDescription: string;
  }>,
): DedicatedEntryIntent {
  const expectedDestination =
    input.moduleId === "time_to_event"
      ? "survival"
      : input.moduleId === "matrix_visualization"
        ? "heatmap"
        : "nonlinear-fit";
  if (input.destination !== expectedDestination) {
    throw new Error(`DEDICATED_ENTRY_DESTINATION_MISMATCH:${input.moduleId}:${input.destination}`);
  }
  const facts: EntryModuleFacts =
    input.moduleId === "time_to_event"
      ? {
          timeToEventPattern: "single_terminal_event_or_censoring",
          // The route establishes one subject record per row, but it does not
          // establish the independent assignment unit. For example, animals
          // may have been assigned by cage or litter. Keep biological n
          // unresolved until the researcher answers that structure-changing
          // fact explicitly.
          subjectUnitRelationship: "unknown",
        }
      : input.moduleId === "ordered_curve_kinetics"
        ? { orderedAxisCount: 1 }
        : {};
  return {
    schemaVersion: DEDICATED_ENTRY_INTENT_VERSION,
    ...input,
    subjectUnitLabel: subjectLabelFor(input.sourceContext, input.moduleId),
    facts,
  };
}
