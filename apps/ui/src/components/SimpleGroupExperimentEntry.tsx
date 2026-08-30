import { useMemo, useState } from "react";

import {
  createExperimentSession,
  createExperimentSetDraft,
  type ExperimentSetDraft,
} from "../app/experimentDraft";
import { useWorkspaceDirtyBaseline } from "../app/useWorkspaceDirtyBaseline";
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
      setMessage("処理・群分けの名前を入力してください。");
      return;
    }
    if (populatedConditions.length < 2) {
      setMessage("比較する条件を2つ以上入力してください。");
      return;
    }
    if (!readoutLabel.trim()) {
      setMessage("測定項目を入力してください。");
      return;
    }
    if (!experimentalUnitLabel.trim()) {
      setMessage("各条件へ個別に割り当てた実験単位を入力してください。");
      return;
    }
    if (!independenceConfirmed) {
      setMessage("独立した単純実験に該当することを確認してください。");
      return;
    }

    const base = createExperimentSetDraft("general_assay", "nested_continuous");
    const draft: ExperimentSetDraft = {
      ...base,
      entryRoute: "simple_independent_groups",
      name: title.trim() || `${factorName.trim()}と${readoutLabel.trim()}`,
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
        <p className="simple-group-entry__eyebrow">専用入口</p>
        <h1 id="simple-group-entry-heading">単純な独立群比較</h1>
        <p>条件名と測定項目を入力すると、すぐに条件別スプレッドシートを作ります。</p>
      </header>

      <aside className="simple-group-entry__scope" aria-label="この入口を使える実験">
        <strong>この入口を使える実験</strong>
        <span>1測定項目・独立した2〜4条件・1実験単位につき1つの値</span>
        <button type="button" onClick={onBack}>
          paired・経時・Cell階層などがある実験として組み立てる
        </button>
      </aside>

      <label>
        <span>実験タイトル（任意）</span>
        <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      </label>

      <div className="simple-group-entry__factor">
        <label>
          <span>処理・群分けの名前</span>
          <input
            value={factorName}
            onChange={(event) => setFactorName(event.currentTarget.value)}
          />
        </label>
        <fieldset>
          <legend>比較する条件</legend>
          <div className="simple-group-entry__condition-grid">
            {conditionLabels.map((label, index) => (
              <label key={index}>
                <span>条件 {index + 1}{index > 1 ? "（任意）" : ""}</span>
                <input
                  aria-label={`単純な群比較の条件 ${index + 1}`}
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
          <span>測定項目（グラフのY軸）</span>
          <input
            placeholder="例：Relative protein amount"
            value={readoutLabel}
            onChange={(event) => setReadoutLabel(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>各条件へ個別に割り当てた実験単位</span>
          <input
            placeholder="例：culture dish、mouse"
            value={experimentalUnitLabel}
            onChange={(event) => setExperimentalUnitLabel(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>対照群（任意）</span>
          <select
            aria-label="単純な群比較の対照群"
            value={controlConditionIndex ?? ""}
            onChange={(event) =>
              setControlConditionIndex(
                event.currentTarget.value === "" ? null : Number(event.currentTarget.value),
              )
            }
          >
            <option value="">指定しない</option>
            {conditionLabels.map((label, index) =>
              label.trim() ? (
                <option key={index} value={index}>
                  {label.trim()}
                </option>
              ) : null,
            )}
          </select>
          <small>各処置を対照群と比較したい場合に指定します。名前から自動判定しません。</small>
        </label>
        <label>
          <span>最初に表示する行数／条件</span>
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
          条件ごとに別々の実験単位を使い、同じ対象の繰り返し測定や、1つの実験単位内の複数Cell・ROIを個別のnとして扱う実験ではありません
        </span>
      </label>

      {message ? <p className="simple-group-entry__message" role="alert">{message}</p> : null}
      <div className="simple-group-entry__actions">
        <button type="button" onClick={onBack}>戻る</button>
        <button type="button" className="primary-button" onClick={createWorksheet}>
          条件別スプレッドシートを作る
        </button>
      </div>
    </section>
  );
}
