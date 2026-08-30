import { parseAdaptiveDelimited, type DelimitedSourceKind } from "@lsaa/adaptive-input";
import {
  createSpecializedEntryDraftProjectState,
  SpecializedEntryIntentSchema,
  type SpecializedEntryDraftAnswers,
  type SpecializedEntryDraftProjectState,
} from "@lsaa/project";

import type { DedicatedEntryIntent } from "./dedicatedEntryIntent";

let specializedDraftSequence = 0;

function nextProjectId(route: "survival" | "nonlinear-fit", timestamp: string): string {
  specializedDraftSequence += 1;
  return `project.specialized.${route}.${timestamp.replace(/[^0-9]/gu, "")}.${specializedDraftSequence}`;
}

function retainedTable(rawText: string, fallbackHeaders: readonly string[]) {
  if (!rawText.trim()) {
    return {
      schemaVersion: "0.1.0" as const,
      headers: [...fallbackHeaders],
      rows: [],
      delimiter: "tab" as const,
      headerRow: 1,
    };
  }
  try {
    const parsed = parseAdaptiveDelimited(rawText);
    return {
      schemaVersion: "0.1.0" as const,
      headers: [...parsed.headers],
      rows: parsed.rows.map((row) => [...row]),
      delimiter: parsed.delimiter,
      headerRow: parsed.headerRow,
    };
  } catch {
    // Exact rawText remains authoritative. This one-column recovery view is
    // deliberately non-semantic and lets malformed/incomplete input survive.
    return {
      schemaVersion: "0.1.0" as const,
      headers: ["Raw input"],
      rows: rawText.split(/\r?\n/u).map((line) => [line]),
      delimiter: null,
      headerRow: null,
    };
  }
}

export function createSpecializedEntryDraft(input: Readonly<{
  route: "survival" | "nonlinear-fit";
  entryIntent: DedicatedEntryIntent;
  rawText: string;
  sourceKind: DelimitedSourceKind | "direct_entry";
  sourceLabel: string;
  answers: SpecializedEntryDraftAnswers;
  safeStop: SpecializedEntryDraftProjectState["safeStop"];
  current?: SpecializedEntryDraftProjectState | null;
  now?: string;
}>): SpecializedEntryDraftProjectState {
  const timestamp = input.now ?? new Date().toISOString();
  const fallbackHeaders =
    input.route === "survival"
      ? ["Unit ID", "Group", "Follow-up time", "Status"]
      : ["Unit ID", "Series", "X", "Y"];
  const metadata = input.current?.metadata ?? {
    projectId: nextProjectId(input.route, timestamp),
    projectName: input.entryIntent.experimentName,
    experimentDate: "",
    operator: "",
    batch: "",
    note: "Dedicated entry draft: experiment structure is unresolved",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return createSpecializedEntryDraftProjectState({
    metadata: { ...metadata, projectName: input.entryIntent.experimentName, updatedAt: timestamp },
    route: input.route,
    entryIntent: SpecializedEntryIntentSchema.parse(input.entryIntent),
    rawTable: retainedTable(input.rawText, fallbackHeaders),
    rawLineage: {
      schemaVersion: "0.1.0",
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel.trim() || `${input.route}-entry`,
      capturedAt: input.current?.rawLineage.capturedAt ?? timestamp,
      rawText: input.rawText,
    },
    answers: input.answers,
    safeStop: input.safeStop,
    provenanceEvents: input.current?.provenanceEvents ?? [
      {
        id: "specialized-draft.create.1",
        kind: "specialized_entry_draft_created",
        occurredAt: timestamp,
        actor: "researcher",
      },
    ],
  });
}

export function specializedSafeStop(
  status: SpecializedEntryDraftProjectState["safeStop"]["status"],
  diagnostics: readonly string[],
): SpecializedEntryDraftProjectState["safeStop"] {
  return {
    status,
    reasonCodes: diagnostics.length ? [...new Set(diagnostics)] : ["SPECIALIZED_ENTRY_UNRESOLVED"],
  };
}
