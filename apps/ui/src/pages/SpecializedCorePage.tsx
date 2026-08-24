import { useMemo, useRef, useState } from "react";
import {
  createD11EngineRequest,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { parseMatrixPaste, parseSurvivalPaste } from "@lsaa/data-sheet";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";
import {
  createHeatmapGraphSpec,
  createHeatmapModel,
  createKaplanMeierGraphModel,
  createSurvivalGraphSpec,
  type HeatmapTransform,
} from "@lsaa/graph-spec";
import { appendMatrixView, createInitialProjectState } from "@lsaa/project";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import { downloadTextFile, serializeGraphSvg, svgToPngBlob } from "../app/graphExport";
import { generateMethodsText } from "../app/methodsText";
import type { SaveProjectAction } from "../app/projectActions";
import { HeatmapGraph } from "../components/graph/HeatmapGraph";
import { SurvivalGraph } from "../components/graph/SurvivalGraph";

type Props = Readonly<{
  mode: "survival" | "heatmap";
  onBack: () => void;
  saveProject?: SaveProjectAction;
  analysisRunner?: AnalysisRunner;
}>;
const now = () => new Date().toISOString();
const day = () => new Date().toISOString().slice(0, 10);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SpecializedCorePage({
  mode,
  onBack,
  saveProject,
  analysisRunner = defaultAnalysisRunner,
}: Props) {
  const [text, setText] = useState(
    mode === "survival"
      ? "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-1\tControl\t4\tEvent\nmouse-2\tControl\t7\tCensored\nmouse-3\tTreatment\t6\tEvent\nmouse-4\tTreatment\t9\tCensored"
      : "Feature\tSample 1\tSample 2\tSample 3\nProtein A\t1\t2\tNA\nProtein B\t3\t5\t8",
  );
  const [transform, setTransform] = useState<HeatmapTransform>("none");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [missingColor, setMissingColor] = useState("#d1d5db");
  const [showCellValues, setShowCellValues] = useState(false);
  const [result, setResult] = useState<AnalysisEngineResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const survival = useMemo(() => {
    if (mode !== "survival") return null;
    try {
      const parsed = parseSurvivalPaste(text);
      const labels = [...new Set(parsed.map(({ conditionId }) => conditionId))];
      const conditions = labels.map((label, index) => ({ id: `condition.${index + 1}`, label }));
      const labelToId = new Map(conditions.map(({ id, label }) => [label, id]));
      const rows = parsed.map((row) => ({ ...row, conditionId: labelToId.get(row.conditionId)! }));
      return {
        rows,
        conditions,
        model: createKaplanMeierGraphModel(
          conditions,
          rows.map((row, index) => ({
            observationId: `observation.${index + 1}`,
            experimentalUnitId: row.unitId,
            conditionId: row.conditionId,
            followUpTime: row.followUpTime,
            eventObserved: row.eventObserved,
          })),
        ),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "入力を確認してください" } as const;
    }
  }, [mode, text]);
  const heatmap = useMemo(() => {
    if (mode !== "heatmap") return null;
    try {
      const raw = parseMatrixPaste(text);
      return { raw, model: createHeatmapModel(raw, transform) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "入力を確認してください" } as const;
    }
  }, [mode, text, transform]);

  const createSurvivalState = () => {
    if (!survival || "error" in survival) throw new Error("有効なsurvival表を入力してください");
    const createdAt = now();
    const design: ExperimentDesign = {
      schemaVersion: "0.2.0",
      id: "design.survival",
      name: "Survival analysis",
      purpose: "animal",
      outcomes: [
        {
          id: "outcome.survival",
          key: "survival",
          label: "Survival",
          type: "time_to_event",
          unit: "follow-up time",
        },
      ],
      factors: [
        {
          id: "factor.group",
          key: "group",
          label: "Group",
          levels: survival.conditions.map((condition, order) => ({
            id: `level.${order + 1}`,
            label: condition.label,
            order,
          })),
        },
      ],
      conditions: survival.conditions.map((condition, index) => ({
        ...condition,
        factorLevels: { "factor.group": `level.${index + 1}` },
      })),
      unitLevels: [
        {
          id: "level.unit",
          key: "unit",
          label: "Biological unit",
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: "level.unit",
      pairing: { kind: "independent" },
      plannedN: Math.max(
        ...survival.conditions.map(
          ({ id }) => survival.rows.filter((row) => row.conditionId === id).length,
        ),
      ),
      normalizationPlans: [],
      primaryContrast: {
        id: "contrast.primary",
        label: "Primary survival comparison",
        conditionIds: [survival.conditions[0]!.id, survival.conditions[1]!.id],
      },
      wizardRuleVersion: "survival-core-0.1.0",
      wizardDecisions: [{ questionId: "survival.censoring", answer: "explicit_event_status" }],
      createdAt,
    };
    const units: UnitInstance[] = survival.rows.map((row) => ({
      id: row.unitId,
      levelId: "level.unit",
      parentUnitId: null,
      label: row.unitId,
      metadata: row.metadata,
    }));
    const observations: Observation[] = survival.rows.map((row, index) => ({
      id: `observation.${index + 1}`,
      rawRevisionId: "raw.1",
      unitInstanceId: row.unitId,
      conditionId: row.conditionId,
      outcomeId: "outcome.survival",
      measurement: {
        kind: "time_to_event",
        followUpTime: row.followUpTime,
        eventObserved: row.eventObserved,
      },
    }));
    const request = createD11EngineRequest({
      requestId: "request.survival.1",
      projectId: "project.survival",
      analysisId: "analysis.survival.1",
      design,
      observations,
      unitInstances: units,
      outcomeId: "outcome.survival",
    });
    return { createdAt, design, units, observations, request };
  };

  const runSurvival = async () => {
    try {
      setMessage("解析中…");
      const prepared = createSurvivalState();
      const next = await analysisRunner(prepared.request);
      setResult(next);
      setMessage("Kaplan–Meier推定とlog-rank検定が完了しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解析できませんでした");
    }
  };
  const save = async () => {
    if (!saveProject) {
      setMessage("デスクトップ版で保存できます。");
      return;
    }
    try {
      if (mode === "survival") {
        if (!result) throw new Error("先にsurvival解析を実行してください");
        const prepared = createSurvivalState();
        const recommendation: AnalysisRecommendation = {
          templateId: "D11",
          templateVersion: "0.1.0",
          recommendedMethod: "log_rank",
          alternativeMethods: [],
          reasonCode: "explicit_time_to_event_groups",
          explanation: "Follow-up time and censoring are explicit for independent groups.",
          statisticalNDefinition: "Biological units with observed follow-up",
        };
        const spec = createSurvivalGraphSpec({
          graphId: "graph.survival.1",
          dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
          analysisResultId: result.requestId,
          timeLabel: "Follow-up time",
        });
        await saveProject(
          createInitialProjectState({
            metadata: {
              projectId: "project.survival",
              projectName: "Survival analysis",
              experimentDate: day(),
              createdAt: prepared.createdAt,
              updatedAt: prepared.createdAt,
            },
            design: prepared.design,
            rawRevision: {
              id: "raw.1",
              previousRevisionId: null,
              sourceKind: "paste",
              createdAt: prepared.createdAt,
              createdBy: "researcher",
            },
            unitInstances: prepared.units,
            observations: prepared.observations,
            actor: "researcher",
            analysis: { recommendation, request: prepared.request, result, graphSpec: spec },
          }),
        );
      } else {
        if (!heatmap || "error" in heatmap) throw new Error("有効なmatrixを入力してください");
        const createdAt = now();
        const condition = {
          id: "condition.cohort",
          label: "Cohort",
          factorLevels: { "factor.cohort": "level.cohort" },
        };
        const design: ExperimentDesign = {
          schemaVersion: "0.2.0",
          id: "design.heatmap",
          name: "Heatmap matrix",
          purpose: "custom",
          outcomes: heatmap.raw.rowIds.map((id, index) => ({
            id,
            key: id,
            label: heatmap.raw.rowLabels[index]!,
            type: "continuous" as const,
          })),
          factors: [
            {
              id: "factor.cohort",
              key: "cohort",
              label: "Cohort",
              levels: [{ id: "level.cohort", label: "Cohort", order: 0 }],
            },
          ],
          conditions: [condition],
          unitLevels: [
            {
              id: "level.sample",
              key: "sample",
              label: "Sample",
              role: "experimental_unit",
              parentLevelId: null,
            },
          ],
          experimentalUnitLevelId: "level.sample",
          pairing: { kind: "independent" },
          plannedN: heatmap.raw.columnIds.length,
          normalizationPlans: [],
          primaryContrast: null,
          wizardRuleVersion: "heatmap-core-0.1.0",
          wizardDecisions: [{ questionId: "heatmap.transform", answer: transform }],
          createdAt,
        };
        const units: UnitInstance[] = heatmap.raw.columnIds.map((id, index) => ({
          id,
          levelId: "level.sample",
          parentUnitId: null,
          label: heatmap.raw.columnLabels[index]!,
          metadata: {},
        }));
        const observations: Observation[] = heatmap.raw.values.flatMap((row, rowIndex) =>
          row.flatMap((value, columnIndex) =>
            value === null
              ? []
              : [
                  {
                    id: `observation.${rowIndex + 1}.${columnIndex + 1}`,
                    rawRevisionId: "raw.1",
                    unitInstanceId: heatmap.raw.columnIds[columnIndex]!,
                    conditionId: condition.id,
                    outcomeId: heatmap.raw.rowIds[rowIndex]!,
                    measurement: { kind: "scalar" as const, value },
                  },
                ],
          ),
        );
        const base = createInitialProjectState({
          metadata: {
            projectId: "project.heatmap",
            projectName: "Heatmap matrix",
            experimentDate: day(),
            createdAt,
            updatedAt: createdAt,
          },
          design,
          rawRevision: {
            id: "raw.1",
            previousRevisionId: null,
            sourceKind: "paste",
            createdAt,
            createdBy: "researcher",
          },
          unitInstances: units,
          observations,
          actor: "researcher",
        });
        const configuredRange =
          rangeMin.trim() && rangeMax.trim()
            ? { min: Number(rangeMin), max: Number(rangeMax) }
            : heatmap.model.range;
        if (
          configuredRange &&
          (!Number.isFinite(configuredRange.min) ||
            !Number.isFinite(configuredRange.max) ||
            configuredRange.min >= configuredRange.max)
        )
          throw new Error("Heatmap rangeは有限値で min < max にしてください");
        const spec = createHeatmapGraphSpec({
          graphId: "graph.heatmap.1",
          dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
          transform,
          range: configuredRange,
          missingColor,
          showCellValues,
        });
        await saveProject(
          appendMatrixView(base, {
            id: "matrix-view.1",
            rawMatrix: heatmap.raw,
            spec,
            createdAt,
            actor: "researcher",
          }),
        );
      }
      setMessage("プロジェクトを保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした");
    }
  };
  const exportSvg = () => {
    if (svgRef.current)
      downloadTextFile(serializeGraphSvg(svgRef.current), `${mode}.svg`, "image/svg+xml");
  };
  const exportPng = async () => {
    if (!svgRef.current) return;
    const box = svgRef.current.viewBox.baseVal;
    downloadBlob(
      await svgToPngBlob(serializeGraphSvg(svgRef.current), box.width, box.height),
      `${mode}.png`,
    );
  };

  const methods =
    mode === "survival" && result && survival && !("error" in survival)
      ? (() => {
          const prepared = createSurvivalState();
          const recommendation: AnalysisRecommendation = {
            templateId: "D11",
            templateVersion: "0.1.0",
            recommendedMethod: "log_rank",
            alternativeMethods: [],
            reasonCode: "explicit_time_to_event_groups",
            explanation: "Explicit survival data",
            statisticalNDefinition: "Biological units",
          };
          return generateMethodsText({
            design: prepared.design,
            recommendation,
            request: prepared.request,
            result,
            outcomeId: "outcome.survival",
          });
        })()
      : null;
  const configuredMin =
    rangeMin.trim() && Number.isFinite(Number(rangeMin)) ? Number(rangeMin) : undefined;
  const configuredMax =
    rangeMax.trim() && Number.isFinite(Number(rangeMax)) ? Number(rangeMax) : undefined;
  return (
    <div className="page-stack">
      <button type="button" onClick={onBack}>
        ← 戻る
      </button>
      <section className="workspace-panel">
        <p className="overline">Specialized Core</p>
        <h1>{mode === "survival" ? "Survival / time-to-event" : "Heatmap / matrix"}</h1>
        <p>
          {mode === "survival"
            ? "Unit ID・Group・Follow-up time・Event/Censored を貼り付けます。censoringは欠損に変換しません。"
            : "1列目をfeature名、1行目をsample名として表を貼り付けます。空欄とNAは欠損のまま保持します。"}
        </p>
        <label>
          表
          <textarea
            aria-label={mode === "survival" ? "Survival data" : "Matrix data"}
            rows={9}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setResult(null);
            }}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
        </label>
        {mode === "heatmap" ? (
          <div>
            <label>
              Transform{" "}
              <select
                aria-label="Heatmap transform"
                value={transform}
                onChange={(event) => setTransform(event.target.value as HeatmapTransform)}
              >
                <option value="none">None</option>
                <option value="row_z_score">Row-wise z-score</option>
                <option value="column_z_score">Column-wise z-score</option>
                <option value="log10">Log10</option>
              </select>
            </label>
            <label>
              Color min{" "}
              <input
                aria-label="Heatmap color minimum"
                type="number"
                value={rangeMin}
                onChange={(event) => setRangeMin(event.target.value)}
              />
            </label>
            <label>
              Color max{" "}
              <input
                aria-label="Heatmap color maximum"
                type="number"
                value={rangeMax}
                onChange={(event) => setRangeMax(event.target.value)}
              />
            </label>
            <label>
              Missing color{" "}
              <input
                aria-label="Heatmap missing color"
                type="color"
                value={missingColor}
                onChange={(event) => setMissingColor(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCellValues}
                onChange={(event) => setShowCellValues(event.target.checked)}
              />{" "}
              Cell valuesを表示
            </label>
          </div>
        ) : null}
        <div>
          {mode === "survival" ? (
            <button type="button" onClick={() => void runSurvival()}>
              Kaplan–Meier + log-rankを実行
            </button>
          ) : null}
          <button type="button" onClick={exportSvg}>
            SVGを書き出す
          </button>
          <button type="button" onClick={() => void exportPng()}>
            PNGを書き出す
          </button>
          <button type="button" onClick={() => void save()}>
            プロジェクトを保存
          </button>
        </div>
        {message ? <p role="status">{message}</p> : null}
      </section>
      <section className="workspace-panel">
        {survival && "error" in survival ? <p role="alert">{survival.error}</p> : null}
        {heatmap && "error" in heatmap ? <p role="alert">{heatmap.error}</p> : null}
        {mode === "survival" && survival && !("error" in survival) ? (
          <SurvivalGraph ref={svgRef} model={survival.model} />
        ) : null}
        {mode === "heatmap" && heatmap && !("error" in heatmap) ? (
          <HeatmapGraph
            ref={svgRef}
            model={heatmap.model}
            min={configuredMin}
            max={configuredMax}
            missingColor={missingColor}
            showCellValues={showCellValues}
          />
        ) : null}
      </section>
      {methods ? (
        <details>
          <summary>Methods</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{methods}</pre>
        </details>
      ) : null}
    </div>
  );
}
