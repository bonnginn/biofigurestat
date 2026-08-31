import { useMemo, useState } from "react";

import {
  createExperimentSession,
  createExperimentSetDraft,
  type ExperimentSetDraft,
} from "../app/experimentDraft";
import { useWorkspaceDirtyBaseline } from "../app/useWorkspaceDirtyBaseline";
import { useAppLocale } from "../app/appLocale";
import "./SimpleGroupExperimentEntry.css";

type SimpleGroupExperimentEntryProps = Readonly<{
  onBack: () => void;
  onReady: (draft: ExperimentSetDraft) => void;
  onDirtyChange?: (dirty: boolean) => void;
}>;

const INITIAL_CONDITIONS = ["", "", "", ""] as const;

export function SimpleGroupExperimentEntry({
  onBack,
  onReady,
  onDirtyChange,
}: SimpleGroupExperimentEntryProps) {
  const locale = useAppLocale();
  const ja = locale === "ja";
  const [title, setTitle] = useState("");
  const [factorName, setFactorName] = useState("Treatment");
  const [conditionLabels, setConditionLabels] = useState<string[]>([...INITIAL_CONDITIONS]);
  const [readoutLabel, setReadoutLabel] = useState("");
  const [experimentalUnitLabel, setExperimentalUnitLabel] = useState("");
  const [controlConditionIndex, setControlConditionIndex] = useState<number | null>(null);
  const [initialUnitCount, setInitialUnitCount] = useState(3);
  const [independenceConfirmed, setIndependenceConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { interactionCaptureProps } = useWorkspaceDirtyBaseline(
    {
      title,
      factorName,
      conditionLabels,
      readoutLabel,
      experimentalUnitLabel,
      controlConditionIndex,
      initialUnitCount,
      independenceConfirmed,
    },
    onDirtyChange,
  );
  const populatedConditionEntries = useMemo(
    () =>
      conditionLabels.flatMap((label, sourceIndex) => {
        const trimmed = label.trim();
        return trimmed ? [{ label: trimmed, sourceIndex }] : [];
      }),
    [conditionLabels],
  );
  const populatedConditions = populatedConditionEntries.map(({ label }) => label);

  const createWorksheet = () => {
    if (!factorName.trim()) {
      setMessage(ja ? "処理・群分けの名前を入力してください。" : "Enter a treatment or grouping name.");
      return;
    }
    if (populatedConditions.length < 2) {
      setMessage(ja ? "比較する条件を2つ以上入力してください。" : "Enter at least two conditions to compare.");
      return;
    }
    if (!readoutLabel.trim()) {
      setMessage(ja ? "測定項目を入力してください。" : "Enter the measured readout.");
      return;
    }
    if (!experimentalUnitLabel.trim()) {
      setMessage(
        ja
          ? "各条件へ個別に割り当てた実験単位を入力してください。"
          : "Enter the experimental unit assigned independently to each condition.",
      );
      return;
    }
    if (!independenceConfirmed) {
      setMessage(
        ja
          ? "独立した単純実験に該当することを確認してください。"
          : "Confirm that this is a simple independent-group experiment.",
      );
      return;
    }

    const base = createExperimentSetDraft("general_assay", "nested_continuous");
    const draft: ExperimentSetDraft = {
      ...base,
      entryRoute: "simple_independent_groups",
      name:
        title.trim() ||
        (ja
          ? `${factorName.trim()}と${readoutLabel.trim()}`
          : `${factorName.trim()} and ${readoutLabel.trim()}`),
      readouts: [
        {
          ...base.readouts[0]!,
          label: readoutLabel.trim(),
          unit: "",
          nestedInputMode: "unit_summary",
        },
      ],
      attributes: [
        {
          id: "attribute.1",
          label: factorName.trim(),
          scientificRole: "intervention",
          unitRole: "between_unit",
          relationship: "independent",
          proposedVisualRole: "x",
        },
      ],
      conditions: populatedConditions.map((label, index) => ({
        id: `condition.${index + 1}`,
        label,
        attributes: { "attribute.1": label },
      })),
      controlConditionId:
        controlConditionIndex === null
          ? undefined
          : (() => {
              const populatedIndex = populatedConditionEntries.findIndex(
                ({ sourceIndex }) => sourceIndex === controlConditionIndex,
              );
              return populatedIndex >= 0 ? `condition.${populatedIndex + 1}` : undefined;
            })(),
      conditionAssignment: {
        kind: "independent",
        unitLabel: experimentalUnitLabel.trim(),
      },
      time: { sampling: "none", unit: "h", points: [] },
      experiments: Array.from({ length: initialUnitCount }, (_, index) =>
        createExperimentSession(index + 1),
      ),
    };
    setMessage(null);
    onDirtyChange?.(false);
    onReady(draft);
  };

  return (
    <section
      className="simple-group-entry"
      aria-labelledby="simple-group-entry-heading"
      {...interactionCaptureProps}
    >
      <header>
        <p className="simple-group-entry__eyebrow">{ja ? "専用入口" : "Dedicated entry"}</p>
        <h1 id="simple-group-entry-heading">
          {ja ? "単純な独立群比較" : "Simple independent-group comparison"}
        </h1>
        <p>
          {ja
            ? "条件名と測定項目を入力すると、すぐに条件別スプレッドシートを作ります。"
            : "Enter condition names and a readout to create a grouped worksheet immediately."}
        </p>
      </header>

      <aside
        className="simple-group-entry__scope"
        aria-label={ja ? "この入口を使える実験" : "Experiments supported by this entry"}
      >
        <strong>{ja ? "この入口を使える実験" : "Use this entry when"}</strong>
        <span>
          {ja
            ? "1測定項目・独立した2〜4条件・1実験単位につき1つの値"
            : "There is one readout, two to four independent conditions, and one value per experimental unit"}
        </span>
        <button type="button" onClick={onBack}>
          {ja
            ? "paired・経時・Cell階層などがある実験として組み立てる"
            : "Use the general setup for paired, longitudinal, or Cell-hierarchy experiments"}
        </button>
      </aside>

      <label>
        <span>{ja ? "実験タイトル（任意）" : "Experiment title (optional)"}</span>
        <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      </label>

      <div className="simple-group-entry__factor">
        <label>
          <span>{ja ? "処理・群分けの名前" : "Treatment or grouping name"}</span>
          <input
            value={factorName}
            onChange={(event) => setFactorName(event.currentTarget.value)}
          />
        </label>
        <fieldset>
          <legend>{ja ? "比較する条件" : "Conditions to compare"}</legend>
          <div className="simple-group-entry__condition-grid">
            {conditionLabels.map((label, index) => (
              <label key={index}>
                <span>
                  {ja ? "条件" : "Condition"} {index + 1}
                  {index > 1 ? (ja ? "（任意）" : " (optional)") : ""}
                </span>
                <input
                  aria-label={
                    ja
                      ? `単純な群比較の条件 ${index + 1}`
                      : `Condition ${index + 1} for simple group comparison`
                  }
                  value={label}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setConditionLabels((current) =>
                      current.map((cell, cellIndex) => (cellIndex === index ? value : cell)),
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="simple-group-entry__row">
        <label>
          <span>{ja ? "測定項目（グラフのY軸）" : "Measured readout (graph Y axis)"}</span>
          <input
            placeholder={ja ? "例：Relative protein amount" : "Example: Relative protein amount"}
            value={readoutLabel}
            onChange={(event) => setReadoutLabel(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>
            {ja
              ? "各条件へ個別に割り当てた実験単位"
              : "Experimental unit assigned independently to each condition"}
          </span>
          <input
            placeholder={ja ? "例：culture dish、mouse" : "Example: culture dish or mouse"}
            value={experimentalUnitLabel}
            onChange={(event) => setExperimentalUnitLabel(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>{ja ? "対照群（任意）" : "Control condition (optional)"}</span>
          <select
            aria-label={ja ? "単純な群比較の対照群" : "Control condition for simple group comparison"}
            value={controlConditionIndex ?? ""}
            onChange={(event) =>
              setControlConditionIndex(
                event.currentTarget.value === "" ? null : Number(event.currentTarget.value),
              )
            }
          >
            <option value="">{ja ? "指定しない" : "Not specified"}</option>
            {conditionLabels.map((label, index) =>
              label.trim() ? (
                <option key={index} value={index}>
                  {label.trim()}
                </option>
              ) : null,
            )}
          </select>
          <small>
            {ja
              ? "各処置を対照群と比較したい場合に指定します。名前から自動判定しません。"
              : "Specify this when each treatment should be compared with a control. BioFigureStat does not infer a control from its name."}
          </small>
        </label>
        <label>
          <span>{ja ? "最初に表示する行数／条件" : "Initial rows per condition"}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={initialUnitCount}
            onChange={(event) =>
              setInitialUnitCount(Math.min(100, Math.max(1, Number(event.currentTarget.value) || 1)))
            }
          />
        </label>
      </div>

      <label className="simple-group-entry__confirmation">
        <input
          type="checkbox"
          checked={independenceConfirmed}
          onChange={(event) => setIndependenceConfirmed(event.currentTarget.checked)}
        />
        <span>
          {ja
            ? "条件ごとに別々の実験単位を使い、同じ対象の繰り返し測定や、1つの実験単位内の複数Cell・ROIを個別のnとして扱う実験ではありません"
            : "Each condition uses separate experimental units. This is not repeated measurement of the same subject, and multiple Cells or ROIs within one experimental unit are not treated as separate n."}
        </span>
      </label>

      {message ? <p className="simple-group-entry__message" role="alert">{message}</p> : null}
      <div className="simple-group-entry__actions">
        <button type="button" onClick={onBack}>{ja ? "戻る" : "Back"}</button>
        <button type="button" className="primary-button" onClick={createWorksheet}>
          {ja ? "条件別スプレッドシートを作る" : "Create grouped worksheet"}
        </button>
      </div>
    </section>
  );
}
