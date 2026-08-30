/**
 * Readiness for the currently implemented two-group time-to-event inference.
 *
 * This is deliberately independent of the D11 request builder. A survival
 * table can be valid and useful for a Kaplan–Meier display even when the
 * current inferential module cannot run (for example, one group or no events).
 * Keeping that distinction here prevents graph/save preparation from being
 * coupled to a statistical request.
 */
export type SurvivalStatisticsReadiness =
  | Readonly<{
      status: "ready";
      reasonCode: "READY";
      researcherMessage: null;
    }>
  | Readonly<{
      status: "not_ready";
      reasonCode:
        | "NO_OBSERVATIONS"
        | "GROUP_WITHOUT_OBSERVATIONS"
        | "INSUFFICIENT_GROUPS"
        | "NO_EVENTS"
        | "INDEPENDENT_UNIT_NOT_CONFIRMED"
        | "NESTED_UNITS_NOT_SUPPORTED";
      researcherMessage: string;
    }>;

export type SurvivalStatisticsReadinessInput = Readonly<{
  /** Groups represented in the graph, including their observed row counts. */
  groups: readonly Readonly<{ observationCount: number }>[];
  eventCount: number;
  /** Whether every row can be treated as one independent biological unit. */
  independentUnitsConfirmed: boolean;
  /** Distinguishes an unresolved relation from an explicitly nested one. */
  nestedUnits?: boolean;
}>;

/**
 * Decide whether the current Survival statistics module may be invoked.
 *
 * No statistical request is created here and no data is discarded. The result
 * is suitable for both disabling the Statistics action and explaining why the
 * same data remains graphable/saveable.
 */
export function survivalStatisticsReadiness(
  input: SurvivalStatisticsReadinessInput,
): SurvivalStatisticsReadiness {
  if (input.groups.length === 0) {
    return {
      status: "not_ready",
      reasonCode: "NO_OBSERVATIONS",
      researcherMessage:
        "Graphは表示できますが、Statisticsには少なくとも1件の実測値が必要です。",
    };
  }
  if (input.groups.some(({ observationCount }) => observationCount <= 0)) {
    return {
      status: "not_ready",
      reasonCode: "GROUP_WITHOUT_OBSERVATIONS",
      researcherMessage:
        "Graphは表示できますが、条件の一つに実測値がないため、現在のStatisticsは実行できません。",
    };
  }
  if (input.groups.length < 2) {
    return {
      status: "not_ready",
      reasonCode: "INSUFFICIENT_GROUPS",
      researcherMessage:
        "Graphは表示できますが、現在のStatisticsは2つ以上の条件を比較する場合に対応しています。",
    };
  }
  if (input.eventCount <= 0) {
    return {
      status: "not_ready",
      reasonCode: "NO_EVENTS",
      researcherMessage:
        "Graphは表示できますが、Eventが1件もないため、現在のStatisticsは実行できません。Censoredの記録はそのまま保存されています。",
    };
  }
  if (input.nestedUnits) {
    return {
      status: "not_ready",
      reasonCode: "NESTED_UNITS_NOT_SUPPORTED",
      researcherMessage:
        "Graphは表示できますが、各行が親試料内の観測であるため、現在のStatisticsでは独立したnを確定できません。",
    };
  }
  if (!input.independentUnitsConfirmed) {
    return {
      status: "not_ready",
      reasonCode: "INDEPENDENT_UNIT_NOT_CONFIRMED",
      researcherMessage:
        "Graphは表示できますが、Statisticsで1例として扱う独立した対象がまだ確定していません。",
    };
  }
  return { status: "ready", reasonCode: "READY", researcherMessage: null };
}
