import { useMemo, useRef, useState } from "react";
import type { AdaptiveInputSnapshot, StructureContract } from "@lsaa/domain";
import {
  ADAPTIVE_SURFACE_GRAMMAR,
  adaptiveMessage,
  buildStructureContract,
  importForSelectedSurface,
  selectAdaptiveSurface,
  targetedConfirmationsFor,
  type AdaptiveLocale,
} from "@lsaa/adaptive-input";
import { adaptiveSurvivalPaste, createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import type { ExperimentCellMap, ExperimentSetDraft } from "../app/experimentDraft";
import "./AdaptiveExperimentEntry.css";

type Props = Readonly<{
  locale: AdaptiveLocale;
  onCancel: () => void;
  onReady: (draft: ExperimentSetDraft, cells: ExperimentCellMap) => void;
  onSurvivalReady: (text: string, snapshot: AdaptiveInputSnapshot) => void;
}>;

const splitLevels = (value: string): string[] => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
const keyHeaders = (contract: StructureContract): string[] => {
  const surface = selectAdaptiveSurface(contract).surfaceId;
  if (surface === "compact_unit_matrix") return [...contract.identities.map(({ label }) => label), ...(contract.factors.find(({ unitRole }) => unitRole === "within_unit") ?? contract.factors[0])!.levels];
  if (surface === "repeated_axis_matrix") return [...contract.identities.map(({ label }) => label), ...contract.factors.filter(({ unitRole }) => unitRole === "between_unit").map(({ label }) => label), ...contract.orderedAxes[0]!.levels.map(String)];
  return [
    ...contract.identities.map(({ label }) => label),
    ...contract.factors.map(({ label }) => label),
    ...contract.orderedAxes.map(({ label }) => label),
    ...contract.unitLevels.filter(({ key, role }) => key !== contract.experimentalUnitLevelKey && role !== "block").map(({ label }) => label),
    ...contract.readouts.flatMap((readout) => readout.representation === "scalar" ? [readout.label] : readout.componentKeys.map((component) => component)),
  ];
};

export function AdaptiveExperimentEntry({ locale, onCancel, onReady, onSurvivalReady }: Props) {
  const [stage, setStage] = useState<"questions" | "input">("questions");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [identity, setIdentity] = useState("");
  const [readout, setReadout] = useState("");
  const [representation, setRepresentation] = useState<StructureContract["readouts"][number]["representation"]>("scalar");
  const [factor, setFactor] = useState("");
  const [levels, setLevels] = useState("");
  const [additionalFactors, setAdditionalFactors] = useState<Array<{ name: string; levels: string; sameIdentity: boolean }>>([]);
  const [matched, setMatched] = useState(false);
  const [axis, setAxis] = useState("");
  const [axisUnit, setAxisUnit] = useState("");
  const [axisLevels, setAxisLevels] = useState("");
  const [nested, setNested] = useState("");
  const [contract, setContract] = useState<StructureContract | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<readonly Record<string, unknown>[]>([]);
  const [importConfirmations, setImportConfirmations] = useState<readonly string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const selection = useMemo(() => contract ? selectAdaptiveSurface(contract) : null, [contract]);
  const confirmations = useMemo(() => contract ? targetedConfirmationsFor(contract) : [], [contract]);

  const createContract = () => {
    try {
      const next = buildStructureContract({
        experimentName: name,
        experimentDescription: description,
        experimentalUnitLabel: unit,
        identityLabel: identity,
        readoutLabel: readout,
        readoutRepresentation: representation,
        ...(factor.trim() && splitLevels(levels).length ? { factorName: factor, factorLevels: splitLevels(levels) } : {}),
        additionalFactors: additionalFactors.map((item) => ({ name: item.name, levels: splitLevels(item.levels), sameIdentityAcrossConditions: item.sameIdentity })),
        sameIdentityAcrossConditions: matched,
        ...(axis.trim() && splitLevels(axisLevels).length ? { orderedAxis: { label: axis, unit: axisUnit, levels: splitLevels(axisLevels).map((item) => Number.isFinite(Number(item)) ? Number(item) : item), sameIdentity: true } } : {}),
        ...(nested.trim() ? { nestedObservationLabel: nested } : {}),
      });
      setContract(next);
      setText(`${keyHeaders(next).join("\t")}\n`);
      setMessage(null);
      setStage("input");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Structure could not be created");
    }
  };

  const importText = (rawText: string, sourceKind: "clipboard" | "csv" | "tsv" | "generic_file", sourceLabel: string) => {
    if (!contract) return;
    try {
      const imported = importForSelectedSurface(contract, rawText, sourceKind, sourceLabel);
      const workspace = createAdaptiveWorkspace({ contract, observations: imported.observations, mapping: imported.mapping, lineage: imported.lineage });
      setPreview(imported.observations.slice(0, 8));
      setImportConfirmations(imported.confirmations);
      const pending = [...confirmations.map(({ key }) => key), ...imported.confirmations].filter((key) => !confirmed.has(key));
      if (pending.length) {
        setMessage(locale === "ja" ? `意味を確認してください: ${pending.join(", ")}` : `Confirm semantic meaning: ${pending.join(", ")}`);
        return;
      }
      if (workspace.status === "dedicated_route_required") {
        onSurvivalReady(adaptiveSurvivalPaste(workspace.snapshot), workspace.snapshot);
        return;
      }
      if (workspace.status !== "ready" || !workspace.draft) {
        setMessage(`${adaptiveMessage(locale, "unsupported")}: ${workspace.diagnostics.join(", ")}`);
        return;
      }
      onReady(workspace.draft, workspace.cells);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Input could not be mapped");
    }
  };

  if (stage === "questions") return (
    <section className="adaptive-entry" aria-labelledby="adaptive-entry-title">
      <p className="experiment-start__eyebrow">Adaptive input Alpha</p>
      <h1 id="adaptive-entry-title">{adaptiveMessage(locale, "entryTitle")}</h1>
      <p>{locale === "ja" ? "統計名ではなく、実際に行った実験を短く定義します。" : "Describe what was done; do not choose a statistical test."}</p>
      <div className="adaptive-entry__form-grid">
        <label><span>{locale === "ja" ? "実験名" : "Experiment name"}</span><input value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <label className="adaptive-entry__wide"><span>{locale === "ja" ? "実際に何をしたか" : "What was done"}</span><textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "独立な生物学的単位" : "Independent biological unit"}</span><input placeholder="culture dish / mouse / donor" value={unit} onChange={(event) => setUnit(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "単位を識別する列" : "Stable identity column"}</span><input placeholder="DishID / MouseID" value={identity} onChange={(event) => setIdentity(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "測定項目" : "Readout"}</span><input value={readout} onChange={(event) => setReadout(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "測定値の形" : "Readout shape"}</span><select value={representation} onChange={(event) => setRepresentation(event.currentTarget.value as typeof representation)}><option value="scalar">Scalar</option><option value="proportion_counts">Numerator / denominator</option><option value="target_reference">Target / reference</option><option value="event_censoring">Follow-up / event</option><option value="category_counts">Category counts</option><option value="dose_response">Dose / response</option></select></label>
        <label><span>{locale === "ja" ? "条件・要因名（任意）" : "Factor name (optional)"}</span><input value={factor} onChange={(event) => setFactor(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "水準（カンマ区切り）" : "Levels (comma separated)"}</span><input value={levels} onChange={(event) => setLevels(event.currentTarget.value)} /></label>
        {additionalFactors.map((item, index) => <div className="adaptive-entry__factor-row" key={index}><label><span>{locale === "ja" ? `条件・要因名 ${index + 2}` : `Factor name ${index + 2}`}</span><input value={item.name} onChange={(event) => { const value = event.currentTarget.value; setAdditionalFactors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, name: value } : row)); }} /></label><label><span>{locale === "ja" ? `水準 ${index + 2}` : `Levels ${index + 2}`}</span><input value={item.levels} onChange={(event) => { const value = event.currentTarget.value; setAdditionalFactors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, levels: value } : row)); }} /></label><label className="adaptive-entry__check"><input type="checkbox" checked={item.sameIdentity} onChange={(event) => { const checked = event.currentTarget.checked; setAdditionalFactors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, sameIdentity: checked } : row)); }} /><span>{locale === "ja" ? "この要因内で同じidentity" : "Same identity within this factor"}</span></label><button type="button" className="secondary-button" aria-label={locale === "ja" ? `要因 ${index + 2}を削除` : `Remove factor ${index + 2}`} onClick={() => setAdditionalFactors((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}
        <button type="button" className="secondary-button adaptive-entry__add-factor" disabled={additionalFactors.length >= 4} onClick={() => setAdditionalFactors((current) => [...current, { name: "", levels: "", sameIdentity: matched }])}>{locale === "ja" ? "＋ 要因を追加" : "+ Add factor"}</button>
        <label className="adaptive-entry__check"><input type="checkbox" checked={matched} onChange={(event) => setMatched(event.currentTarget.checked)} /><span>{locale === "ja" ? "同じidentityを条件間で測定した" : "The same identity was measured across conditions"}</span></label>
        <label><span>{locale === "ja" ? "順序軸名（任意）" : "Ordered axis (optional)"}</span><input value={axis} onChange={(event) => setAxis(event.currentTarget.value)} /></label>
        <label><span>{locale === "ja" ? "軸単位 / 水準" : "Axis unit / levels"}</span><div className="adaptive-entry__inline"><input aria-label="Axis unit" value={axisUnit} onChange={(event) => setAxisUnit(event.currentTarget.value)} /><input aria-label="Axis levels" value={axisLevels} onChange={(event) => setAxisLevels(event.currentTarget.value)} /></div></label>
        <label><span>{locale === "ja" ? "単位内の観測レベル（任意）" : "Nested observation level (optional)"}</span><input placeholder="cell / field / technical well" value={nested} onChange={(event) => setNested(event.currentTarget.value)} /></label>
      </div>
      {message ? <p role="alert" className="adaptive-entry__message">{message}</p> : null}
      <div className="adaptive-entry__actions"><button type="button" className="secondary-button" onClick={onCancel}>{locale === "ja" ? "現行入口へ戻る" : "Back"}</button><button type="button" className="primary-button" disabled={!name.trim() || !description.trim() || !unit.trim() || !identity.trim() || !readout.trim()} onClick={createContract}>{locale === "ja" ? "入力面を作る" : "Generate input surface"}</button></div>
    </section>
  );

  if (!contract || !selection) return null;
  const grammar = ADAPTIVE_SURFACE_GRAMMAR[selection.surfaceId];
  return (
    <section className="adaptive-entry" aria-labelledby="adaptive-surface-title" data-adaptive-surface={selection.surfaceId}>
      <p className="experiment-start__eyebrow">{adaptiveMessage(locale, "structureSummary")}</p>
      <h1 id="adaptive-surface-title">{selection.surfaceId}</h1>
      <dl className="adaptive-entry__summary"><div><dt>{locale === "ja" ? "生物学的n" : "Biological n"}</dt><dd>{contract.unitLevels.find(({ key }) => key === contract.experimentalUnitLevelKey)?.label}</dd></div><div><dt>Identity</dt><dd>{contract.identities.map(({ label }) => label).join(", ")}</dd></div><div><dt>{locale === "ja" ? "行" : "Rows"}</dt><dd>{grammar.row}</dd></div><div><dt>{locale === "ja" ? "列" : "Columns"}</dt><dd>{grammar.columns}</dd></div></dl>
      {confirmations.map((confirmation) => <label className="adaptive-entry__confirmation" key={confirmation.key}><input type="checkbox" checked={confirmed.has(confirmation.key)} onChange={(event) => setConfirmed((current) => { const next = new Set(current); if (event.currentTarget.checked) next.add(confirmation.key); else next.delete(confirmation.key); return next; })} /><span>{confirmation.reason}</span></label>)}
      {importConfirmations.map((key) => <label className="adaptive-entry__confirmation" key={key}><input type="checkbox" checked={confirmed.has(key)} onChange={(event) => setConfirmed((current) => { const next = new Set(current); if (event.currentTarget.checked) next.add(key); else next.delete(key); return next; })} /><span>{locale === "ja" ? "欠損理由を確認しました" : "I confirmed the missingness reason"}</span></label>)}
      <label className="adaptive-entry__paste"><span>{adaptiveMessage(locale, "pasteLabel")}</span><textarea aria-label={adaptiveMessage(locale, "pasteLabel")} value={text} onChange={(event) => setText(event.currentTarget.value)} onPaste={() => setMessage(null)} /></label>
      <input ref={fileRef} className="adaptive-entry__file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; void file.text().then((raw) => { setText(raw); importText(raw, file.name.endsWith(".csv") ? "csv" : file.name.endsWith(".tsv") ? "tsv" : "generic_file", file.name); }); }} />
      <div className="adaptive-entry__actions"><button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>{adaptiveMessage(locale, "importFile")}</button><button type="button" className="primary-button" onClick={() => importText(text, "clipboard", "clipboard")}>{adaptiveMessage(locale, "continue")}</button></div>
      {message ? <p role="alert" className="adaptive-entry__message">{message}</p> : null}
      {preview.length ? <div className="adaptive-entry__preview" tabIndex={0}><table aria-label={locale === "ja" ? "正規化後の入力preview" : "Normalized input preview"}><thead><tr><th scope="col">Observation</th><th scope="col">Identity</th><th scope="col">Factors</th><th scope="col">Values</th></tr></thead><tbody>{preview.map((row) => <tr key={String(row.observationId)}><th scope="row">{String(row.observationId)}</th><td>{JSON.stringify(row.identities)}</td><td>{JSON.stringify(row.factors)}</td><td>{JSON.stringify(row.values)}</td></tr>)}</tbody></table></div> : null}
    </section>
  );
}
