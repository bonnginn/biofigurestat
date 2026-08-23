import { useEffect, useState } from "react";

import {
  currentBenchmarkRun,
  recordBenchmarkEvent,
  resetBenchmarkRun,
  setBenchmarkOutcome,
  setBenchmarkSupportStatus,
  startBenchmarkRun,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
  type BenchmarkOutcome,
  type BenchmarkSupportStatus,
} from "../app/benchmarkEvaluation";
import { evaluationMode } from "../app/evaluationMode";
import {
  advanceBlindBatch,
  fetchBlindBatchCurrent,
  type BlindBatchCurrent,
} from "../app/blindBatch";
import {
  fetchLiteratureExperimenterCase,
  isLiteratureCaseId,
  type LiteratureExperimenterCase,
} from "../app/literatureBenchmark";

const NON_SCIENTIFIC_OUTCOMES: readonly BenchmarkOutcome[] = [
  "infrastructure_failure",
  "contaminated",
  "aborted_not_started",
];

type UnsupportedEvidenceOwner = Readonly<{
  caseId: string;
  runId: string;
  packageSha256: string;
}>;

type UnsupportedEvidenceDraft = Readonly<{
  owner: UnsupportedEvidenceOwner | null;
  scientificReason: string;
  experimentalUnit: string;
  biologicalN: string;
  attemptedRoutes: string;
  scientificCompromiseReason: string;
}>;

export function createFreshUnsupportedEvidence(
  owner: UnsupportedEvidenceOwner | null = null,
): UnsupportedEvidenceDraft {
  return {
    owner,
    scientificReason: "",
    experimentalUnit: "",
    biologicalN: "",
    attemptedRoutes: "",
    scientificCompromiseReason: "",
  };
}

export function metadataOutcomeCanBeRecorded(
  outcome: BenchmarkOutcome | null,
  supportStatus: BenchmarkSupportStatus | null,
): boolean {
  if (!outcome || outcome === "in_progress" || outcome === "completed") return false;
  return outcome === "explicit_unsupported" ? supportStatus === "impossible" : true;
}

export function BenchmarkRunBar({ onNavigateHome }: { onNavigateHome?: () => void }) {
  const run = useBenchmarkRun();
  const [benchmarkVersion, setBenchmarkVersion] = useState("LSA50_v1_1");
  const [caseId, setCaseId] = useState("pilot_independent_2group");
  const [track, setTrack] = useState<"track_A" | "track_B">("track_A");
  const [runId, setRunId] = useState("run_001");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const [caseDeliveryStatus, setCaseDeliveryStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [blindBatch, setBlindBatch] = useState<BlindBatchCurrent | null>(null);
  const [batchStatus, setBatchStatus] = useState<"loading" | "ready" | "error">("loading");
  const [unsupportedEvidence, setUnsupportedEvidence] = useState<UnsupportedEvidenceDraft>(() =>
    createFreshUnsupportedEvidence(),
  );
  useEffect(() => {
    let cancelled = false;
    void fetchBlindBatchCurrent()
      .then((batch) => {
        if (cancelled) return;
        setBlindBatch(batch);
        setBatchStatus("ready");
        if (!batch?.current) return;
        const identity = {
          benchmarkVersion: batch.benchmarkVersion,
          caseId: batch.current.caseId,
          track: batch.current.track,
          runId: batch.current.runId,
        } as const;
        setBenchmarkVersion(identity.benchmarkVersion);
        setCaseId(identity.caseId);
        setTrack(identity.track);
        setRunId(identity.runId);
        const evidenceOwner = {
          caseId: batch.current.caseId,
          runId: batch.current.runId,
          packageSha256: batch.current.packageSha256,
        };
        const terminalEvidence = batch.current.terminalEvidence;
        if (terminalEvidence) {
          setUnsupportedEvidence({
            owner: evidenceOwner,
            scientificReason: terminalEvidence.scientificReason,
            experimentalUnit: terminalEvidence.experimentalUnit,
            biologicalN:
              terminalEvidence.biologicalN === null ? "" : String(terminalEvidence.biologicalN),
            attemptedRoutes: terminalEvidence.attemptedRoutes.join("\n"),
            scientificCompromiseReason: terminalEvidence.scientificCompromiseReason,
          });
        } else {
          setUnsupportedEvidence(createFreshUnsupportedEvidence(evidenceOwner));
        }
        if (
          batch.current.status !== "active" &&
          batch.current.status !== "explicit_unsupported"
        ) {
          return;
        }
        const existing = currentBenchmarkRun().identity;
        if (!existing || existing.runId !== identity.runId) {
          resetBenchmarkRun();
          startBenchmarkRun(identity);
        }
        if (batch.current.status === "explicit_unsupported") {
          setBenchmarkSupportStatus("impossible");
          setBenchmarkOutcome("explicit_unsupported");
        }
      })
      .catch(() => {
        if (!cancelled) setBatchStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const identity = run.identity;
    setLiteratureCase(null);
    setCaseDeliveryStatus("idle");
    if (!identity || !isLiteratureCaseId(identity.caseId)) return;
    let cancelled = false;
    setCaseDeliveryStatus("loading");
    void fetchLiteratureExperimenterCase(identity)
      .then((loaded) => {
        if (cancelled) return;
        setLiteratureCase(loaded);
        setCaseDeliveryStatus("ready");
        recordBenchmarkEvent("blind_case_delivered", {
          caseId: loaded.caseId,
          syntheticRows: loaded.syntheticData.length,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCaseDeliveryStatus("error");
        recordBenchmarkEvent("blind_case_delivery_failed", { caseId: identity.caseId });
      });
    return () => {
      cancelled = true;
    };
  }, [run.identity]);
  const saveMetadataOnlyOutcome = async () => {
    if (!run.identity || !metadataOutcomeCanBeRecorded(run.outcome, run.supportStatus)) return;
    const isExplicitUnsupported = run.outcome === "explicit_unsupported";
    const parsedRoutes = unsupportedEvidence.attemptedRoutes
      .split(/[\n,]/)
      .map((route) => route.trim())
      .filter(Boolean);
    const parsedBiologicalN = unsupportedEvidence.biologicalN.trim()
      ? Number(unsupportedEvidence.biologicalN)
      : null;
    if (
      isExplicitUnsupported &&
      (caseDeliveryStatus !== "ready" ||
        !literatureCase ||
        !blindBatch?.current ||
        blindBatch.current.status !== "active" ||
        blindBatch.current.runId !== run.identity.runId ||
        unsupportedEvidence.owner?.caseId !== run.identity.caseId ||
        unsupportedEvidence.owner.runId !== run.identity.runId ||
        unsupportedEvidence.owner.packageSha256 !== blindBatch.current.packageSha256 ||
        !unsupportedEvidence.scientificReason.trim() ||
        !unsupportedEvidence.experimentalUnit.trim() ||
        !unsupportedEvidence.scientificCompromiseReason.trim() ||
        parsedRoutes.length === 0 ||
        (parsedBiologicalN !== null && (!Number.isFinite(parsedBiologicalN) || parsedBiologicalN <= 0)))
    ) {
      setSaveStatus("Explicit unsupportedには配信済みpacketと科学的根拠の入力が必要です。");
      return;
    }
    try {
      if (isExplicitUnsupported) {
        recordBenchmarkEvent("explicit_unsupported_finalized", {
          caseId: unsupportedEvidence.owner?.caseId ?? null,
          runId: unsupportedEvidence.owner?.runId ?? null,
          packageSha256: unsupportedEvidence.owner?.packageSha256 ?? null,
          scientificReason: unsupportedEvidence.scientificReason.trim(),
          experimentalUnit: unsupportedEvidence.experimentalUnit.trim(),
          biologicalN: parsedBiologicalN,
          attemptedRoutes: parsedRoutes.join(" | "),
          scientificCompromiseReason: unsupportedEvidence.scientificCompromiseReason.trim(),
        });
      }
      recordBenchmarkEvent("benchmark_metadata_only_outcome_recorded", {
        outcome: run.outcome,
      });
      const completed = currentBenchmarkRun();
      const completedAt = new Date().toISOString();
      await writeBenchmarkArtifacts([
        {
          name: "run.json",
          content: JSON.stringify(
            {
              ...completed.identity,
              appVersion: "0.1.0",
              sourceRevision: evaluationMode.sourceRevision,
              productRevision: evaluationMode.sourceRevision,
              benchmarkInfrastructureRevision: evaluationMode.sourceRevision,
              engineVersion: null,
              startedAt: completed.startedAt,
              completedAt,
              outcome: completed.outcome,
              supportStatus: completed.supportStatus,
              artifactCompleteness: isExplicitUnsupported
                ? "metadata_only_explicit_unsupported"
                : "metadata_only",
              ...(isExplicitUnsupported
                ? {
                    blindPackage: {
                      caseId: completed.identity?.caseId,
                      runId: completed.identity?.runId,
                      sha256: blindBatch?.current?.packageSha256,
                    },
                    evidenceProvenance: unsupportedEvidence.owner,
                    unsupportedEvidenceProvenanceVersion: "1.0.0",
                    scientificReason: unsupportedEvidence.scientificReason.trim(),
                    experimentalUnit: unsupportedEvidence.experimentalUnit.trim(),
                    biologicalN: parsedBiologicalN,
                    attemptedRoutes: parsedRoutes,
                    scientificCompromiseReason:
                      unsupportedEvidence.scientificCompromiseReason.trim(),
                  }
                : {}),
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
      ], isExplicitUnsupported ? { requiredArtifacts: ["run.json", "interaction_log.json"] } : {});
      if (isExplicitUnsupported) {
        const persistedBatch = await fetchBlindBatchCurrent();
        setBlindBatch(persistedBatch);
        setSaveStatus("Explicit unsupportedを検証・永続化しました。");
      } else {
        setSaveStatus("対応状況と操作ログを保存しました。");
      }
    } catch {
      setSaveStatus("対応状況を保存できませんでした。");
    }
  };
  const advanceToNextCase = async () => {
    setSaveStatus("server-side verifierを確認中…");
    try {
      const batch = await advanceBlindBatch();
      setLiteratureCase(null);
      setCaseDeliveryStatus("idle");
      setUnsupportedEvidence(createFreshUnsupportedEvidence());
      resetBenchmarkRun();
      onNavigateHome?.();
      setBlindBatch(batch);
      if (batch?.current) {
        const identity = {
          benchmarkVersion: batch.benchmarkVersion,
          caseId: batch.current.caseId,
          track: batch.current.track,
          runId: batch.current.runId,
        } as const;
        setBenchmarkVersion(identity.benchmarkVersion);
        setCaseId(identity.caseId);
        setTrack(identity.track);
        setRunId(identity.runId);
        setUnsupportedEvidence(
          createFreshUnsupportedEvidence({
            caseId: batch.current.caseId,
            runId: batch.current.runId,
            packageSha256: batch.current.packageSha256,
          }),
        );
        startBenchmarkRun(identity);
        setSaveStatus(`Case ${batch.position} / ${batch.total} を開始しました。`);
      } else {
        setSaveStatus("Blind batchは全件完了しました。");
      }
    } catch {
      setSaveStatus("server-side verificationが未完了または失敗しました。停止します。");
    }
  };
  return (
    <section className="benchmark-run-bar" aria-label="Benchmark run">
      <strong>Benchmark</strong>
      {blindBatch ? (
        <strong role="status">
          Blind benchmark batch: Case {blindBatch.position} / {blindBatch.total} · {blindBatch.status}
        </strong>
      ) : null}
      {batchStatus === "error" ? <span role="alert">Blind batch queueを確認できません。</span> : null}
      <label>
        <span>Version</span>
        <input
          value={benchmarkVersion}
          disabled={Boolean(blindBatch)}
          onChange={(event) => setBenchmarkVersion(event.target.value)}
        />
      </label>
      <label>
        <span>Case</span>
        <input disabled={Boolean(blindBatch)} value={caseId} onChange={(event) => setCaseId(event.target.value)} />
      </label>
      <label>
        <span>Track</span>
        <select disabled={Boolean(blindBatch)} value={track} onChange={(event) => setTrack(event.target.value as typeof track)}>
          <option value="track_A">Track A</option>
          <option value="track_B">Track B</option>
        </select>
      </label>
      <label>
        <span>Run</span>
        <input disabled={Boolean(blindBatch)} value={runId} onChange={(event) => setRunId(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          if (run.identity) {
            resetBenchmarkRun();
            setUnsupportedEvidence(
              createFreshUnsupportedEvidence(
                blindBatch?.current?.status === "active"
                  ? {
                      caseId: blindBatch.current.caseId,
                      runId: blindBatch.current.runId,
                      packageSha256: blindBatch.current.packageSha256,
                    }
                  : null,
              ),
            );
          } else {
            startBenchmarkRun({ benchmarkVersion, caseId, track, runId });
          }
        }}
      >
        {run.identity ? "Runをリセット" : blindBatch ? "Active caseを開始" : "Runを開始"}
      </button>
      {blindBatch && (run.outcome === "completed" || blindBatch.status === "ready_to_advance") ? (
        <button type="button" onClick={() => void advanceToNextCase()}>
          次のケース
        </button>
      ) : null}
      {run.identity ? (
        <label>
          <span>Benchmark outcome</span>
          <select
            value={run.outcome ?? "in_progress"}
            onChange={(event) => setBenchmarkOutcome(event.target.value as BenchmarkOutcome)}
          >
            <option value="in_progress">In progress</option>
            <option value="completed" disabled>
              Completed (set by 9-artifact finalizer)
            </option>
            <option value="explicit_unsupported">Explicit unsupported</option>
            <option value="infrastructure_failure">Infrastructure failure</option>
            <option value="contaminated">Contaminated</option>
            <option value="aborted_not_started">Aborted / not started</option>
          </select>
        </label>
      ) : null}
      {run.identity ? (
        <label>
          <span>Scientific support</span>
          <select
            value={run.supportStatus ?? ""}
            disabled={Boolean(run.outcome && NON_SCIENTIFIC_OUTCOMES.includes(run.outcome))}
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
      {run.identity && run.outcome === "explicit_unsupported" ? (
        <section className="benchmark-case-delivery" aria-label="Explicit unsupported evidence">
          <label>
            <span>Scientific reason</span>
            <textarea
              value={unsupportedEvidence.scientificReason}
              onChange={(event) =>
                setUnsupportedEvidence((current) => ({
                  ...current,
                  scientificReason: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Experimental unit</span>
            <input
              value={unsupportedEvidence.experimentalUnit}
              onChange={(event) =>
                setUnsupportedEvidence((current) => ({
                  ...current,
                  experimentalUnit: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Biological n (if determinable)</span>
            <input
              type="number"
              min="1"
              value={unsupportedEvidence.biologicalN}
              onChange={(event) =>
                setUnsupportedEvidence((current) => ({
                  ...current,
                  biologicalN: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Attempted routes</span>
            <textarea
              value={unsupportedEvidence.attemptedRoutes}
              onChange={(event) =>
                setUnsupportedEvidence((current) => ({
                  ...current,
                  attemptedRoutes: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Why continuation would require scientific compromise</span>
            <textarea
              value={unsupportedEvidence.scientificCompromiseReason}
              onChange={(event) =>
                setUnsupportedEvidence((current) => ({
                  ...current,
                  scientificCompromiseReason: event.target.value,
                }))
              }
            />
          </label>
        </section>
      ) : null}
      {run.identity ? (
        <button
          type="button"
          disabled={
            !metadataOutcomeCanBeRecorded(run.outcome, run.supportStatus) ||
            (run.outcome === "explicit_unsupported" && caseDeliveryStatus !== "ready") ||
            blindBatch?.current?.status === "explicit_unsupported"
          }
          onClick={saveMetadataOnlyOutcome}
        >
          終了状態だけ記録
        </button>
      ) : null}
      {caseDeliveryStatus === "loading" ? <span role="status">Blind caseを読込中…</span> : null}
      {caseDeliveryStatus === "error" ? (
        <div className="benchmark-case-delivery is-error" role="alert">
          Blind caseを配信できません。Scientific supportを評価せず、Infrastructure failureまたは
          Aborted / not startedとして記録してください。
        </div>
      ) : null}
      {caseDeliveryStatus === "ready" && literatureCase ? (
        <section className="benchmark-case-delivery" aria-label="Blinded researcher packet">
          <strong>
            Blind case ready: {literatureCase.caseId} / {literatureCase.syntheticData.length}
            synthetic rows
          </strong>
          <span>{literatureCase.researcherPacket.blind_experiment_summary}</span>
          <span>Measurement: {literatureCase.researcherPacket.measurement_context}</span>
          <span>Conditions: {literatureCase.researcherPacket.conditions}</span>
          <span>Time: {literatureCase.researcherPacket.timepoints}</span>
          <span>Readouts: {literatureCase.researcherPacket.readouts}</span>
          <span>
            Experimental unit: {literatureCase.researcherPacket.experimental_unit_description}
          </span>
          <span>
            Independent sessions: {literatureCase.researcherPacket.independent_session_count}
          </span>
          <span>{literatureCase.researcherPacket.repeated_identity_note}</span>
          <span>{literatureCase.researcherPacket.nested_observation_note}</span>
          <span>
            Synthetic dataset is armed. After constructing a compatible design, use the Literature
            Benchmark loader in the experiment workspace.
          </span>
        </section>
      ) : null}
      {saveStatus ? <span role="status">{saveStatus}</span> : null}
    </section>
  );
}
