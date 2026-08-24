import { z } from "zod";

export const SurvivalGraphDatumSchema = z.object({
  observationId: z.string().min(1),
  experimentalUnitId: z.string().min(1),
  conditionId: z.string().min(1),
  followUpTime: z.number().finite().nonnegative(),
  eventObserved: z.boolean(),
});

export type SurvivalGraphDatum = z.infer<typeof SurvivalGraphDatumSchema>;

export type KaplanMeierGraphModel = Readonly<{
  type: "kaplan_meier";
  groups: readonly Readonly<{
    conditionId: string;
    label: string;
    n: number;
    events: number;
    censored: number;
    steps: readonly Readonly<{ time: number; survival: number }>[];
    censorMarks: readonly Readonly<{
      time: number;
      survival: number;
      experimentalUnitId: string;
    }>[];
    numberAtRisk: readonly Readonly<{ time: number; count: number }>[];
  }>[];
}>;

export function createKaplanMeierGraphModel(
  conditions: readonly Readonly<{ id: string; label: string }>[],
  input: readonly SurvivalGraphDatum[],
): KaplanMeierGraphModel {
  if (conditions.length < 1) throw new Error("Kaplan–Meier graph requires at least one group");
  const data = input.map((datum) => SurvivalGraphDatumSchema.parse(datum));
  const seenUnits = new Set<string>();
  data.forEach((datum) => {
    if (seenUnits.has(datum.experimentalUnitId)) {
      throw new Error("Each survival unit can appear only once");
    }
    seenUnits.add(datum.experimentalUnitId);
  });
  const groups = conditions.map((condition) => {
    const rows = data.filter(({ conditionId }) => conditionId === condition.id);
    if (!rows.length) throw new Error(`Survival group ${condition.id} has no observations`);
    const times = [...new Set(rows.map(({ followUpTime }) => followUpTime))].sort((a, b) => a - b);
    let survival = 1;
    const steps: Array<{ time: number; survival: number }> = [{ time: 0, survival: 1 }];
    const survivalAtTime = new Map<number, number>([[0, 1]]);
    times.forEach((time) => {
      const atRisk = rows.filter(({ followUpTime }) => followUpTime >= time).length;
      const events = rows.filter((row) => row.followUpTime === time && row.eventObserved).length;
      if (events) survival *= 1 - events / atRisk;
      steps.push({ time, survival });
      survivalAtTime.set(time, survival);
    });
    return {
      conditionId: condition.id,
      label: condition.label,
      n: rows.length,
      events: rows.filter(({ eventObserved }) => eventObserved).length,
      censored: rows.filter(({ eventObserved }) => !eventObserved).length,
      steps,
      censorMarks: rows
        .filter(({ eventObserved }) => !eventObserved)
        .map(({ followUpTime, experimentalUnitId }) => ({
          time: followUpTime,
          survival: survivalAtTime.get(followUpTime) ?? 1,
          experimentalUnitId,
        })),
      numberAtRisk: times.map((time) => ({
        time,
        count: rows.filter(({ followUpTime }) => followUpTime >= time).length,
      })),
    };
  });
  return { type: "kaplan_meier", groups };
}
