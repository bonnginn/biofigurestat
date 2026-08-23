import { useState } from "react";

import {
  currentBenchmarkRun,
  recordBenchmarkEvent,
  resetBenchmarkRun,
  setBenchmarkSupportStatus,
  startBenchmarkRun,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
  type BenchmarkSupportStatus,
} from "../app/benchmarkEvaluation";
import { evaluationMode } from "../app/evaluationMode";

export function BenchmarkRunBar() {
  const run = useBenchmarkRun();
  const [benchmarkVersion, setBenchmarkVersion] = useState("LSA50_v1_1");
  const [caseId, setCaseId] = useState("pilot_independent_2group");
  const [track, setTrack] = useState<"track_A" | "track_B">("track_A");
  const [runId, setRunId] = useState("run_001");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const saveMetadataOnlyOutcome = async () => {
    if (!run.identity || !run.supportStatus) return;
    try {
      recordBenchmarkEvent("benchmark_metadata_only_run_completed");
      const completed = currentBenchmarkRun();
      await writeBenchmarkArtifacts([
        {
          name: "run.json",
          content: JSON.stringify(
            {
              ...completed.identity,
              appVersion: "0.1.0",
              sourceRevision: evaluationMode.sourceRevision,
              engineVersion: null,
              startedAt: completed.startedAt,
              completedAt: new Date().toISOString(),
              supportStatus: completed.supportStatus,
              artifactCompleteness: "metadata_only",
              defaultGraphCaptured: completed.defaultGraphCaptured,
              interactionCount: completed.events.length,
              graphEditCount: completed.events.filter(
                ({ type }) => type === "graph_configuration_changed",
              ).length,
            },
            null,
            2,
          ),
        },
        {
          name: "interaction_log.json",
          content: JSON.stringify(completed.events, null, 2),
        },
      ]);
      setSaveStatus("対応状況と操作ログを保存しました。");
    } catch {
      setSaveStatus("対応状況を保存できませんでした。");
    }
  };
  return (
    <section className="benchmark-run-bar" aria-label="Benchmark run">
      <strong>Benchmark</strong>
      <label>
        <span>Version</span>
        <input
          value={benchmarkVersion}
          onChange={(event) => setBenchmarkVersion(event.target.value)}
        />
      </label>
      <label>
        <span>Case</span>
        <input value={caseId} onChange={(event) => setCaseId(event.target.value)} />
      </label>
      <label>
        <span>Track</span>
        <select value={track} onChange={(event) => setTrack(event.target.value as typeof track)}>
          <option value="track_A">Track A</option>
          <option value="track_B">Track B</option>
        </select>
      </label>
      <label>
        <span>Run</span>
        <input value={runId} onChange={(event) => setRunId(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() =>
          run.identity
            ? resetBenchmarkRun()
            : startBenchmarkRun({ benchmarkVersion, caseId, track, runId })
        }
      >
        {run.identity ? "Runをリセット" : "Runを開始"}
      </button>
      {run.identity ? (
        <label>
          <span>対応状況</span>
          <select
            value={run.supportStatus ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setBenchmarkSupportStatus(value ? (value as BenchmarkSupportStatus) : null);
            }}
          >
            <option value="">未評価</option>
            <option value="direct">Direct support</option>
            <option value="reasonable_workaround">Reasonable workaround</option>
            <option value="scientifically_compromising">Scientifically compromising</option>
            <option value="impossible">Impossible</option>
          </select>
        </label>
      ) : null}
      {run.identity ? (
        <button type="button" disabled={!run.supportStatus} onClick={saveMetadataOnlyOutcome}>
          結果だけ記録
        </button>
      ) : null}
      {saveStatus ? <span role="status">{saveStatus}</span> : null}
    </section>
  );
}
