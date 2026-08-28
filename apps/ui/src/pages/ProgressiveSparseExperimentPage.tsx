import { useMemo, useState } from "react";
import type { ExperimentCanvas, ObservationPatternSet } from "@lsaa/domain";
import {
  createProgressiveExperimentProjectState,
  type ProgressiveExperimentProjectState,
  type ProgressiveSparseGraphSettings,
} from "@lsaa/project";

import {
  emptySparseDraft,
  graphValue,
  labelForCondition,
  parseSparseClipboard,
  snapshotFromSparseDraft,
  sparseDraftFromSnapshot,
  sparseSheetCompatibility,
  type SparseDraft,
  type SparseDraftRow,
} from "./progressiveSparseExperimentModel";
import "./ProgressiveSparseExperimentPage.css";

export type SaveProgressiveExperimentAction = (
  state: ProgressiveExperimentProjectState,
  existingTarget?: string,
) => Promise<{ state: ProgressiveExperimentProjectState; target: string } | null>;
export type OpenProgressiveExperimentAction = () => Promise<{
  state: ProgressiveExperimentProjectState;
  target: string;
} | null>;

type Props = Readonly<{
  canvas: ExperimentCanvas;
  pattern: ObservationPatternSet;
  initialState?: ProgressiveExperimentProjectState | null;
  saveProject?: SaveProgressiveExperimentAction;
  openProject?: OpenProgressiveExperimentAction;
  projectId?: string;
}>;

const now = () => new Date().toISOString();
let progressiveProjectSequence = 0;
const nextProgressiveId = (prefix: string) => {
  progressiveProjectSequence += 1;
  return `${prefix}.${Date.now().toString(36)}.${progressiveProjectSequence}`;
};

export function ProgressiveSparseExperimentPage({
  canvas,
  pattern,
  initialState = null,
  saveProject,
  openProject,
  projectId,
}: Props) {
  const hasUnknown = canvas.conditionCells.some(({ status }) => status === "unknown");
  const compatibility = useMemo(() => sparseSheetCompatibility(canvas, pattern), [canvas, pattern]);
  const sections = compatibility.sections;
  const compatibleReadouts = canvas.readouts.filter((readout) =>
    sections.some(({ readoutKey }) => readoutKey === readout.key),
  );
  const [stableIds, setStableIds] = useState(() => ({
    projectId:
      initialState?.metadata.projectId ?? projectId ?? nextProgressiveId("project.progressive"),
    snapshotId:
      initialState?.progressiveEntry.snapshotId ?? nextProgressiveId("snapshot.progressive"),
    createdAt: initialState?.metadata.createdAt ?? now(),
  }));
  const [projectMetadata, setProjectMetadata] = useState(initialState?.metadata ?? null);
  const [baseSnapshot, setBaseSnapshot] = useState(initialState?.progressiveEntry ?? null);
  const [dataDirty, setDataDirty] = useState(false);
  const [draft, setDraft] = useState<SparseDraft>(() =>
    initialState
      ? sparseDraftFromSnapshot(sections, initialState.progressiveEntry)
      : emptySparseDraft(sections),
  );
  const [sourceKind, setSourceKind] = useState<"direct_entry" | "clipboard">(
    initialState?.progressiveEntry.rawLineage?.sourceKind === "clipboard"
      ? "clipboard"
      : "direct_entry",
  );
  const [pasteText, setPasteText] = useState<Record<string, string>>({});
  const [pasteErrors, setPasteErrors] = useState<Record<string, string>>({});
  const [activeReadout, setActiveReadout] = useState(
    initialState?.graphSettings.find(({ graphId }) => graphId === initialState.activeGraphId)
      ?.readoutKey ??
      compatibleReadouts[0]?.key ??
      "",
  );
  const [graphTitle, setGraphTitle] = useState(
    initialState?.graphSettings.find(({ graphId }) => graphId === initialState.activeGraphId)
      ?.title ?? canvas.experimentLabel,
  );
  const [target, setTarget] = useState<string | undefined>();
  const [message, setMessage] = useState("");

  const generated = useMemo(() => {
    if (hasUnknown) return null;
    if (baseSnapshot && !dataDirty) {
      return { snapshot: baseSnapshot, errors: {} };
    }
    return snapshotFromSparseDraft({
      snapshotId: stableIds.snapshotId,
      projectId: stableIds.projectId,
      savedAt: now(),
      canvas,
      pattern,
      sections,
      draft,
      sourceKind,
      baseSnapshot,
    });
  }, [
    baseSnapshot,
    canvas,
    dataDirty,
    draft,
    hasUnknown,
    pattern,
    sections,
    sourceKind,
    stableIds,
  ]);

  if (hasUnknown) {
    return (
      <main className="progressive-sparse-page">
        <h1>{canvas.experimentLabel}</h1>
        <section className="sparse-safe-stop" role="alert">
          <strong>NEED_MORE_INFORMATION</strong>
          <p>
            実施したか不明な条件があります。測定値の表を作る前に、各組み合わせを「実施した」または「実施していない」に確定してください。
          </p>
        </section>
      </main>
    );
  }

  if (compatibility.issues.length > 0) {
    return (
      <main className="progressive-sparse-page">
        <h1>{canvas.experimentLabel}</h1>
        <section className="sparse-safe-stop" role="alert">
          <strong>SAFE_UNSUPPORTED</strong>
          <p>
            この簡易入力面では、必要な同一性や階層を失わずに表を作れません。別の実験構造へ自動変換しません。
          </p>
          <ul>
            {compatibility.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  const snapshot = generated!.snapshot;
  const rowErrors = generated!.errors;
  const performedCells = canvas.conditionCells.filter(({ status }) => status === "performed");
  const notPerformedCells = canvas.conditionCells.filter(
    ({ status }) => status === "not_performed",
  );
  const graphSections = sections.filter(({ readoutKey }) => readoutKey === activeReadout);
  const graphPoints = graphSections.flatMap((section) =>
    snapshot.stagedRecords.flatMap((record) => {
      if (
        record.conditionCellId !== section.conditionCellId ||
        record.observation.readoutKey !== section.readoutKey
      )
        return [];
      const value = graphValue(record, section);
      return value === null ? [] : [{ condition: section.conditionLabel, value }];
    }),
  );
  const graphConditions = [...new Set(graphPoints.map(({ condition }) => condition))];
  const maxValue = Math.max(1, ...graphPoints.map(({ value }) => value));
  const selectedGraphStatus = graphPoints.length ? "READY" : "NEED_MORE_INFORMATION";

  const replaceRows = (sectionKey: string, rows: readonly SparseDraftRow[]) => {
    setDraft((current) => ({ ...current, [sectionKey]: rows }));
    setSourceKind("direct_entry");
    setDataDirty(true);
  };
  const updateCell = (
    sectionKey: string,
    rowIndex: number,
    field: "identity" | number,
    value: string,
  ) => {
    const rows = [...(draft[sectionKey] ?? [])];
    const row = rows[rowIndex]!;
    rows[rowIndex] =
      field === "identity"
        ? { ...row, identity: value }
        : {
            ...row,
            components: row.components.map((item, index) => (index === field ? value : item)),
          };
    replaceRows(sectionKey, rows);
  };
  const projectState = () => {
    const measuredGraphConditionIds = [
      ...new Set(
        sections
          .filter(({ readoutKey }) => readoutKey === activeReadout)
          .map(({ conditionCellId }) => conditionCellId),
      ),
    ];
    const graphSettings: ProgressiveSparseGraphSettings[] =
      activeReadout && measuredGraphConditionIds.length
        ? [
            {
              schemaVersion: "0.1.0",
              graphId: "graph.progressive.active",
              readoutKey: activeReadout,
              title: graphTitle,
              yLabel:
                canvas.readouts.find(({ key }) => key === activeReadout)?.label ?? activeReadout,
              showIndividualPoints: true,
              conditionCellIds: measuredGraphConditionIds,
            },
          ]
        : [];
    return createProgressiveExperimentProjectState({
      metadata: projectMetadata ?? {
        projectId: stableIds.projectId,
        projectName: canvas.experimentLabel,
        experimentDate: "",
        createdAt: stableIds.createdAt,
        updatedAt: snapshot.savedAt,
      },
      progressiveEntry: snapshot,
      graphSettings,
      activeGraphId: graphSettings[0]?.graphId ?? null,
    });
  };

  return (
    <main className="progressive-sparse-page">
      <header className="sparse-page-header">
        <div>
          <p className="eyebrow">既知の疎な実験・isolated Alpha slice</p>
          <h1>{canvas.experimentLabel}</h1>
        </div>
        <div className="sparse-project-actions">
          <button
            disabled={!openProject}
            onClick={async () => {
              const opened = await openProject?.();
              if (!opened) return;
              if (
                JSON.stringify(opened.state.progressiveEntry.canvas) !== JSON.stringify(canvas) ||
                JSON.stringify(opened.state.progressiveEntry.activePattern) !==
                  JSON.stringify(pattern)
              ) {
                setMessage(
                  "この画面とは異なる条件表または測定構造のprojectです。現在の入力へ混ぜずに停止しました。",
                );
                return;
              }
              setDraft(sparseDraftFromSnapshot(sections, opened.state.progressiveEntry));
              setSourceKind(
                opened.state.progressiveEntry.rawLineage?.sourceKind === "clipboard"
                  ? "clipboard"
                  : "direct_entry",
              );
              const openedGraph = opened.state.graphSettings.find(
                ({ graphId }) => graphId === opened.state.activeGraphId,
              );
              if (openedGraph) {
                setActiveReadout(openedGraph.readoutKey);
                setGraphTitle(openedGraph.title);
              }
              setStableIds({
                projectId: opened.state.metadata.projectId,
                snapshotId: opened.state.progressiveEntry.snapshotId,
                createdAt: opened.state.metadata.createdAt,
              });
              setProjectMetadata(opened.state.metadata);
              setBaseSnapshot(opened.state.progressiveEntry);
              setDataDirty(false);
              setTarget(opened.target);
              setMessage("保存した入力を開きました。");
            }}
          >
            開く
          </button>
          <button
            disabled={!saveProject || Object.keys(rowErrors).length > 0}
            onClick={async () => {
              const saved = await saveProject?.(projectState(), target);
              if (!saved) return;
              setTarget(saved.target);
              setProjectMetadata(saved.state.metadata);
              setBaseSnapshot(saved.state.progressiveEntry);
              setDataDirty(false);
              setMessage("保存しました。");
            }}
          >
            保存
          </button>
        </div>
      </header>
      {message && <p role="status">{message}</p>}

      <section className="sparse-canvas-summary" aria-labelledby="canvas-heading">
        <h2 id="canvas-heading">実施した条件</h2>
        <p>
          {performedCells.length}組を入力対象にします。実施していない{notPerformedCells.length}
          組は条件表に保持しますが、測定値の欄は作りません。
        </p>
        <ul>
          {notPerformedCells.map((cell) => (
            <li key={cell.conditionCellId}>
              実施していない：{labelForCondition(canvas, cell.conditionCellId)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sheet-heading">
        <h2 id="sheet-heading">測定値</h2>
        <p>
          条件ごとに行数を変えられます。ID列を含むTSV、または測定値だけのTSVをまとめて貼り付けられます。
        </p>
        {sections.map((section) => (
          <article className="sparse-sheet-card" key={section.sectionKey}>
            <h3>
              {section.conditionLabel} — {section.readoutLabel}
            </h3>
            <div className="sparse-paste-row">
              <textarea
                aria-label={`${section.conditionLabel} ${section.readoutLabel} 貼り付け`}
                value={pasteText[section.sectionKey] ?? ""}
                onChange={(event) =>
                  setPasteText((current) => ({
                    ...current,
                    [section.sectionKey]: event.target.value,
                  }))
                }
                placeholder={
                  section.representation === "scalar"
                    ? `${section.identityLabel}\t値`
                    : `${section.identityLabel}\t陽性数\t総数`
                }
              />
              <button
                onClick={() => {
                  const raw = pasteText[section.sectionKey] ?? "";
                  const parsed = parseSparseClipboard(raw, section);
                  if (parsed.error) {
                    setPasteErrors((current) => ({
                      ...current,
                      [section.sectionKey]: parsed.error!,
                    }));
                    return;
                  }
                  setPasteErrors((current) => ({ ...current, [section.sectionKey]: "" }));
                  setDraft((current) => ({ ...current, [section.sectionKey]: parsed.rows }));
                  setSourceKind("clipboard");
                  setDataDirty(true);
                }}
              >
                貼り付けを反映
              </button>
            </div>
            {pasteErrors[section.sectionKey] && (
              <p className="field-error" role="alert">
                {pasteErrors[section.sectionKey]}
              </p>
            )}
            <div className="sparse-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{section.identityLabel}</th>
                    {section.componentKeys.map((key) => (
                      <th key={key}>
                        {section.representation === "proportion_counts"
                          ? key === section.componentKeys[0]
                            ? "陽性数"
                            : "総数"
                          : section.readoutLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(draft[section.sectionKey] ?? []).map((row, rowIndex) => (
                    <tr key={row.rowKey}>
                      <td>
                        <input
                          aria-label={`${section.conditionLabel} ${section.identityLabel} ${rowIndex + 1}`}
                          value={row.identity}
                          onChange={(event) =>
                            updateCell(section.sectionKey, rowIndex, "identity", event.target.value)
                          }
                        />
                      </td>
                      {row.components.map((value, componentIndex) => (
                        <td key={section.componentKeys[componentIndex]}>
                          <input
                            inputMode="decimal"
                            aria-label={`${section.conditionLabel} ${section.componentKeys[componentIndex]} ${rowIndex + 1}`}
                            value={value}
                            onChange={(event) =>
                              updateCell(
                                section.sectionKey,
                                rowIndex,
                                componentIndex,
                                event.target.value,
                              )
                            }
                          />
                        </td>
                      ))}
                      {rowErrors[row.rowKey] && (
                        <td className="field-error">{rowErrors[row.rowKey]}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="add-row"
              onClick={() =>
                replaceRows(section.sectionKey, [
                  ...(draft[section.sectionKey] ?? []),
                  {
                    rowKey: `${section.sectionKey}|row.${(draft[section.sectionKey]?.length ?? 0) + 1}`,
                    identity: "",
                    components: section.componentKeys.map(() => ""),
                  },
                ])
              }
            >
              ＋ 行を追加
            </button>
          </article>
        ))}
      </section>

      <section className="sparse-results-grid">
        <article aria-labelledby="graph-heading">
          <h2 id="graph-heading">Graph（記述）</h2>
          <label>
            表示する測定値
            <select
              value={activeReadout}
              onChange={(event) => setActiveReadout(event.target.value)}
            >
              {compatibleReadouts.map((readout) => (
                <option key={readout.key} value={readout.key}>
                  {readout.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            タイトル
            <input value={graphTitle} onChange={(event) => setGraphTitle(event.target.value)} />
          </label>
          {graphPoints.length ? (
            <svg
              className="sparse-graph"
              role="img"
              aria-label={`${graphTitle} descriptive Graph`}
              viewBox="0 0 640 300"
            >
              <line className="graph-axis" x1="70" x2="590" y1="230" y2="230" />
              <line className="graph-axis" x1="70" x2="70" y1="40" y2="230" />
              <text className="graph-axis-label" x="20" y="140" transform="rotate(-90 20 140)">
                {canvas.readouts.find(({ key }) => key === activeReadout)?.label ?? activeReadout}
              </text>
              <text className="graph-tick-label" x="58" y="235">
                0
              </text>
              <text className="graph-tick-label" x="48" y="45">
                {maxValue.toPrecision(3)}
              </text>
              {graphConditions.map((condition, index) => {
                const x = 70 + index * (500 / Math.max(1, graphConditions.length - 1));
                return (
                  <text
                    className="graph-condition-label"
                    key={condition}
                    x={x}
                    y="258"
                    textAnchor="middle"
                  >
                    {condition}
                  </text>
                );
              })}
              {graphPoints.map((point, index) => {
                const centerX =
                  70 +
                  graphConditions.indexOf(point.condition) *
                    (500 / Math.max(1, graphConditions.length - 1));
                const ordinal = graphPoints
                  .slice(0, index)
                  .filter(({ condition }) => condition === point.condition).length;
                const count = graphPoints.filter(
                  ({ condition }) => condition === point.condition,
                ).length;
                const x = centerX + (ordinal - (count - 1) / 2) * 10;
                const y = 220 - (point.value / maxValue) * 180;
                return <circle key={`${point.condition}-${index}`} cx={x} cy={y} r="5" />;
              })}
            </svg>
          ) : (
            <p>有効な測定値を入力すると、ここに個々の点を表示します。</p>
          )}
          <p className="readiness">Graph: {selectedGraphStatus}</p>
        </article>
        <article aria-labelledby="statistics-heading">
          <h2 id="statistics-heading">Statistics</h2>
          <strong>{snapshot.readiness.statistics.status}</strong>
          <p>
            {snapshot.readiness.statistics.status === "SAFE_UNSUPPORTED"
              ? "この同一性・対応関係は安全に復元できないため、推論解析へ変換しません。"
              : "条件表と測定値は保持されています。比較する条件、対応関係、独立した例数を確認できるまで、推論解析は実行しません。"}
          </p>
          <p>実施していない組み合わせを、実施済みとして補完することはありません。</p>
        </article>
      </section>
    </main>
  );
}
