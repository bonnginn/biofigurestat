import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  beginDefaultGraphCapture,
  blobToBase64,
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordBenchmarkEvent,
  recordFinalGraphCapture,
  setBenchmarkOutcome,
  sha256Hex,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
} from "../app/benchmarkEvaluation";
import { evaluationMode } from "../app/evaluationMode";
import { downloadTextFile, serializeGraphSvg, svgToPngBlob } from "../app/graphExport";
import {
  fetchLiteratureExperimenterCase,
  isLiteratureCaseId,
  type LiteratureExperimenterCase,
} from "../app/literatureBenchmark";
import { generateMethodsText } from "../app/methodsText";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import type { SaveProjectAction } from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import { AnalysisRouteSwitcher } from "../components/AnalysisRouteSwitcher";
import { HeatmapGraph } from "../components/graph/HeatmapGraph";
import { SurvivalGraph } from "../components/graph/SurvivalGraph";

type Props = Readonly<{
  mode: "survival" | "heatmap";
  onBack: () => void;
  saveProject?: SaveProjectAction;
  analysisRunner?: AnalysisRunner;
  onNavigate?: (route: AppRoute) => void;
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
  onNavigate,
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
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const benchmarkRun = useBenchmarkRun();

  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    if (!identity || !isLiteratureCaseId(identity.caseId)) return;
    let cancelled = false;
    void fetchLiteratureExperimenterCase(identity).then((loaded) => {
      if (!cancelled) setLiteratureCase(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [benchmarkRun.identity]);

  const loadLiteratureSurvival = () => {
    if (!literatureCase || mode !== "survival") return;
    const rows = literatureCase.syntheticData;
    if (!rows.length || rows.some(({ event, time }) => event === null || time === null)) {
      setMessage("このcaseはevent/censoringとfollow-up timeを完全には保持していません。");
      return;
    }
    const lines = [
      "Unit ID\tGroup\tFollow-up time\tStatus",
      ...rows.map((row) => {
        const event = String(row.event).trim().toLowerCase();
        const status = ["1", "event", "observed", "true"].includes(event) ? "Event" : "Censored";
        return [row.unit_id, row.condition, row.time, status].join("\t");
      }),
    ];
    setText(lines.join("\n"));
    setResult(null);
    setMessage(`${rows.length}件のevent/censoring identityをSurvival表へ入力しました。`);
    recordBenchmarkEvent("literature_benchmark_data_loaded", {
      caseId: literatureCase.caseId,
      mappedCells: rows.length,
    });
  };

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
      recordBenchmarkEvent("statistics_executed", {
        method: prepared.request.method,
        recommendedMethod: "log_rank",
        recommendationDiffers: false,
        recommendationReasonCode: "explicit_time_to_event_groups",
        recommendationExplanation:
          "Follow-up time and censoring are explicit for independent groups.",
        recommendationDecision: null,
        recommendationSelectedMethod: prepared.request.method,
        contrast:
          prepared.request.protocolVersion === "0.8.0"
            ? prepared.request.conditionIds.join("|")
            : null,
        protocolVersion: prepared.request.protocolVersion,
        engineVersion: next.engine.version,
      });
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
  const benchmarkAnalysisState = JSON.stringify({
    mode,
    text,
    result,
  });
  const captureDefaultBenchmarkGraph = async () => {
    const svg = svgRef.current;
    if (!svg || !result || !benchmarkRun.identity || benchmarkRun.defaultGraphCapture) return;
    const capturedAt = new Date().toISOString();
    if (!beginDefaultGraphCapture(capturedAt)) return;
    try {
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      await writeBenchmarkArtifacts([
        { name: "default_graph.svg", content: svgText, mediaType: "image/svg+xml" },
        {
          name: "default_graph.png",
          content: await blobToBase64(png),
          encoding: "base64",
          mediaType: "image/png",
        },
      ]);
      completeDefaultGraphCapture({
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setMessage("Benchmarkの既定Survival Graphを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("既定Graphの評価artifactを保存できませんでした。");
    }
  };

  useLayoutEffect(() => {
    if (
      mode === "survival" &&
      result &&
      benchmarkRun.identity &&
      !benchmarkRun.defaultGraphCapture
    ) {
      void captureDefaultBenchmarkGraph();
    }
  }, [
    benchmarkAnalysisState,
    benchmarkRun.defaultGraphCapture,
    benchmarkRun.identity,
    mode,
    result,
  ]);

  const finalizeSpecializedBenchmark = async () => {
    const svg = svgRef.current;
    const run = currentBenchmarkRun();
    if (
      mode !== "survival" ||
      !svg ||
      !result ||
      !methods ||
      !run.identity ||
      !run.supportStatus ||
      !run.defaultGraphCaptured
    ) {
      setMessage(
        "完了前にdata load、解析、Default Graph保存、Scientific support選択を完了してください。",
      );
      return;
    }
    try {
      const prepared = createSurvivalState();
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const capturedAt = new Date().toISOString();
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      recordFinalGraphCapture({
        capturedAt,
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setBenchmarkOutcome("completed");
      recordBenchmarkEvent("benchmark_run_finalized", {
        selectedGraph: "kaplan_meier",
        selectedStatistics: prepared.request.method,
      });
      const finalRun = currentBenchmarkRun();
      const graphState = {
        graphType: "kaplan_meier",
        conditions: survival && !("error" in survival) ? survival.conditions : [],
        censoringPreserved: true,
        analysis: { request: prepared.request, result },
      };
      await writeBenchmarkArtifacts(
        [
          {
            name: "run.json",
            content: JSON.stringify(
              {
                ...finalRun.identity,
                appVersion: PRODUCT_IDENTITY.version,
                sourceRevision: evaluationMode.sourceRevision,
                engineVersion: result.engine.version,
                startedAt: finalRun.startedAt,
                completedAt: capturedAt,
                outcome: finalRun.outcome,
                supportStatus: finalRun.supportStatus,
                artifactCompleteness: "complete",
                defaultGraphCaptured: finalRun.defaultGraphCaptured,
                captureProvenanceVersion: "1.1.0",
                defaultCapturedAt: finalRun.defaultGraphCapture?.capturedAt ?? null,
                defaultCapturedEventIndex: finalRun.defaultGraphCapture?.eventIndex ?? null,
                finalCapturedAt: finalRun.finalGraphCapture?.capturedAt ?? null,
                finalCapturedEventIndex: finalRun.finalGraphCapture?.eventIndex ?? null,
                defaultGraphStateFingerprint:
                  finalRun.defaultGraphCapture?.graphStateFingerprint ?? null,
                finalGraphStateFingerprint:
                  finalRun.finalGraphCapture?.graphStateFingerprint ?? null,
                defaultAnalysisStateFingerprint:
                  finalRun.defaultGraphCapture?.analysisStateFingerprint ?? null,
                finalAnalysisStateFingerprint:
                  finalRun.finalGraphCapture?.analysisStateFingerprint ?? null,
                defaultSvgSha256: finalRun.defaultGraphCapture?.svgSha256 ?? null,
                defaultPngSha256: finalRun.defaultGraphCapture?.pngSha256 ?? null,
                finalSvgSha256: finalRun.finalGraphCapture?.svgSha256 ?? null,
                finalPngSha256: finalRun.finalGraphCapture?.pngSha256 ?? null,
                interactionCount: finalRun.events.length,
                graphEditCount: 0,
                renderedGraphEditCount: 0,
                analysisEditCount: finalRun.events.filter(
                  ({ effect }) => effect === "analysis_only" || effect === "both",
                ).length,
              },
              null,
              2,
            ),
          },
          { name: "final_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "final_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
          {
            name: "statistics.json",
            content: JSON.stringify(
              {
                statisticalUnit: "biological unit",
                recommendedMethod: "log_rank",
                selectedMethod: prepared.request.method,
                correction: prepared.request.options.multiplicityMethod,
                request: prepared.request,
                result,
                state: "current",
                applicationVersion: PRODUCT_IDENTITY.version,
              },
              null,
              2,
            ),
          },
          { name: "methods.txt", content: methods },
          { name: "graph_state.json", content: JSON.stringify(graphState, null, 2) },
          {
            name: "interaction_log.json",
            content: JSON.stringify(finalRun.events, null, 2),
          },
        ],
        { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
      );
      setMessage("Survival benchmark runの9 artifactsを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("Survival benchmark artifactを保存できませんでした。");
    }
  };
  return (
    <div className="page-stack">
      <button type="button" onClick={onBack}>
        ← 戻る
      </button>
      <AnalysisRouteSwitcher current={mode} onNavigate={onNavigate} />
      <section className="workspace-panel">
        <p className="overline">Specialized Core</p>
        <h1>{mode === "survival" ? "Survival / time-to-event" : "Heatmap / matrix"}</h1>
        <p>
          {mode === "survival"
            ? "Unit ID・Group・Follow-up time・Event/Censored を貼り付けます。censoringは欠損に変換しません。"
            : "1列目をfeature名、1行目をsample名として表を貼り付けます。空欄とNAは欠損のまま保持します。"}
        </p>
        {mode === "survival" && literatureCase ? (
          <section className="benchmark-pilot-loader" aria-label="Literature Survival合成値">
            <div>
              <strong>{literatureCase.caseId}</strong>
              <span>
                event/censoringとfollow-up timeをstable unit IDのままSurvival表へ入力します。
              </span>
            </div>
            <button type="button" onClick={loadLiteratureSurvival}>
              このLiterature caseをSurvival表へ入力
            </button>
          </section>
        ) : null}
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
          {mode === "survival" && benchmarkRun.identity ? (
            <button type="button" onClick={() => void finalizeSpecializedBenchmark()}>
              Benchmarkを9 artifactsで完了
            </button>
          ) : null}
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
