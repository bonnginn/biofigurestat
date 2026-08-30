import { useEffect, useMemo, useState } from "react";

import type { ExperimentCellMap, ExperimentSetDraft } from "../app/experimentDraft";
import { recordBenchmarkEvent, useBenchmarkRun } from "../app/benchmarkEvaluation";
import { BENCHMARK_PILOT_CASES, mapBenchmarkPilotMeasurements } from "../app/benchmarkPilotCases";
import {
  fetchLiteratureExperimenterCase,
  isLiteratureCaseId,
  mapLiteratureMeasurements,
  type LiteratureExperimenterCase,
} from "../app/literatureBenchmark";

export function EvaluationWorkspaceLoader({
  draft,
  activeTab,
  showGraph,
  onLoad,
}: {
  draft: ExperimentSetDraft;
  activeTab: string;
  showGraph: boolean;
  onLoad: (
    cells: ExperimentCellMap,
    axis?: Readonly<{
      semantic: "time" | "numeric_covariate" | "categorical";
      title: string;
      unit: string;
    }>,
  ) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const [literatureLoadError, setLiteratureLoadError] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
  const benchmarkPilot = BENCHMARK_PILOT_CASES.find(
    ({ caseId }) => caseId === benchmarkRun.identity?.caseId,
  );
  const benchmarkPilotLoad = useMemo(
    () => (benchmarkPilot ? mapBenchmarkPilotMeasurements(benchmarkPilot, draft) : null),
    [benchmarkPilot, draft],
  );

  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    setLiteratureLoadError(null);
    if (!identity || !isLiteratureCaseId(identity.caseId)) return;
    let cancelled = false;
    void fetchLiteratureExperimenterCase(identity)
      .then((loaded) => {
        if (!cancelled) setLiteratureCase(loaded);
      })
      .catch(() => {
        if (!cancelled) setLiteratureLoadError("Literature benchmark caseを読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, [benchmarkRun.identity]);

  const literatureLoad = useMemo(
    () => (literatureCase ? mapLiteratureMeasurements(literatureCase, draft) : null),
    [literatureCase, draft],
  );
  if (activeTab === "overview" || showGraph) return null;

  return (
    <>
      {benchmarkPilot && benchmarkPilotLoad ? (
        <section className="benchmark-pilot-loader" aria-label="Benchmark Pilot合成値">
          <div>
            <strong>{benchmarkPilot.title}</strong>
            <span>{benchmarkPilotLoad.reason}</span>
          </div>
          <button
            type="button"
            disabled={!benchmarkPilotLoad.compatible}
            onClick={() => {
              if (!benchmarkPilotLoad.compatible) return;
              onLoad(benchmarkPilotLoad.cells);
              setMessage("合成値をすべての実験タブへ入力しました。");
              recordBenchmarkEvent("benchmark_pilot_data_loaded", {
                caseId: benchmarkPilot.caseId,
                mappedCells: Object.keys(benchmarkPilotLoad.cells).length,
              });
            }}
          >
            このPilotの合成値を一括入力
          </button>
          {message ? <span role="status">{message}</span> : null}
        </section>
      ) : null}

      {literatureLoadError ? (
        <div className="experiment-workspace-demo-banner" role="alert">
          {literatureLoadError}
        </div>
      ) : null}

      {literatureCase && literatureLoad ? (
        <section className="benchmark-pilot-loader" aria-label="Literature Benchmark合成値">
          <div>
            <strong>{literatureCase.caseId}</strong>
            <span>{literatureCase.researcherPacket.blind_experiment_summary}</span>
            <span>{literatureLoad.reason}</span>
            {literatureCase.paperReference ? (
              <span>
                Paper: {literatureCase.paperReference.target_figure_or_panel}；
                {literatureCase.paperReference.curated_graph_reference}；
                {literatureCase.paperReference.paper_reported_analysis}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!literatureLoad.compatible}
            onClick={() => {
              if (!literatureLoad.compatible) return;
              onLoad(literatureLoad.cells, literatureLoad.xAxis);
              setMessage("Literature benchmark合成値を入力しました。");
              recordBenchmarkEvent("literature_benchmark_data_loaded", {
                caseId: literatureCase.caseId,
                mappedCells: Object.keys(literatureLoad.cells).length,
              });
            }}
          >
            このLiterature caseの合成値を一括入力
          </button>
          {message ? <span role="status">{message}</span> : null}
        </section>
      ) : null}
    </>
  );
}
