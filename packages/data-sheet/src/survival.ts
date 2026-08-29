import { z } from "zod";

export const SurvivalSheetRowSchema = z.object({
  unitId: z.string().min(1),
  conditionId: z.string().min(1),
  followUpTime: z.number().finite().nonnegative(),
  eventObserved: z.boolean(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type SurvivalSheetRow = z.infer<typeof SurvivalSheetRowSchema>;

export type SurvivalPasteOptions = Readonly<{
  numericStatusMapping?: Readonly<{ event: "0" | "1"; censored: "0" | "1" }>;
}>;

function parseStatus(value: string, options: SurvivalPasteOptions): boolean {
  const normalized = value.trim().toLowerCase();
  if (["event", "observed", "event observed"].includes(normalized)) return true;
  if (["censored", "censor"].includes(normalized)) return false;
  const mapping = options.numericStatusMapping;
  if (mapping && normalized === mapping.event && mapping.event !== mapping.censored) return true;
  if (mapping && normalized === mapping.censored && mapping.event !== mapping.censored)
    return false;
  throw new Error(
    `Invalid survival status '${value}'. Use Event/Censored or select an explicit numeric mapping.`,
  );
}

/** Parses a tab/comma separated survival table without treating missing values as censoring. */
export function parseSurvivalPaste(
  text: string,
  options: SurvivalPasteOptions = {},
): SurvivalSheetRow[] {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("Survival paste requires a header and at least one row");
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const header = lines[0]!.split(delimiter).map((cell) =>
    cell
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*$/u, ""),
  );
  const aliases: Record<string, string[]> = {
    unit: [
      "unit id", "unit", "subject id", "subject", "sample id", "animal id", "animal",
      "mouse id", "mouse", "個体id", "動物id", "マウスid",
    ],
    group: [
      "group", "condition", "condition id", "treatment", "cohort", "arm", "群", "条件", "処置",
    ],
    time: [
      "follow-up time", "follow up time", "follow-up", "time-to-event", "survival time",
      "duration", "time", "追跡時間", "生存時間",
    ],
    status: [
      "event/censor status", "event status", "censoring status", "status", "event", "outcome",
      "状態", "イベント",
    ],
  };
  const column = (key: keyof typeof aliases) =>
    header.findIndex((label) => aliases[key].includes(label));
  const indexes = {
    unit: column("unit"),
    group: column("group"),
    time: column("time"),
    status: column("status"),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    const labels = {
      unit: "個体ID",
      group: "群・処置",
      time: "追跡時間",
      status: "Event/Censored状態",
    };
    const missing = (Object.keys(indexes) as (keyof typeof indexes)[])
      .filter((key) => indexes[key] < 0)
      .map((key) => labels[key]);
    throw new Error(`Survival表に必要な列がありません: ${missing.join("、")}`);
  }
  const seen = new Set<string>();
  return lines.slice(1).map((line, rowIndex) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    const unitId = cells[indexes.unit] ?? "";
    const conditionId = cells[indexes.group] ?? "";
    const timeText = cells[indexes.time] ?? "";
    const statusText = cells[indexes.status] ?? "";
    if (!unitId || !conditionId || !timeText || !statusText) {
      throw new Error(`Survival row ${rowIndex + 2} has a missing required value`);
    }
    if (seen.has(unitId)) throw new Error(`Duplicate survival unit ID '${unitId}'`);
    seen.add(unitId);
    const followUpTime = Number(timeText);
    const requiredColumns = new Set(Object.values(indexes));
    const metadata = Object.fromEntries(
      header.flatMap((label, index) =>
        requiredColumns.has(index) || !label ? [] : [[label, cells[index] ?? ""]],
      ),
    );
    return SurvivalSheetRowSchema.parse({
      unitId,
      conditionId,
      followUpTime,
      eventObserved: parseStatus(statusText, options),
      metadata,
    });
  });
}
