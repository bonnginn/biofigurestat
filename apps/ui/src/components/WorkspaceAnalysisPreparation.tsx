import { useState } from "react";
import type { ExperimentSetDraft, ReadoutDraft } from "../app/experimentDraft";

export function needsAnalysisPreparation(draft: ExperimentSetDraft): boolean {
  return draft.conditions.length === 1 || draft.readouts.some(({ shape }) => shape === "wb_ratio");
}

/** Optional plans on an already explicit design; never changes raw data or unit matching. */
export function WorkspaceAnalysisPreparation({
  draft,
  onReady,
  onBack,
}: {
  draft: ExperimentSetDraft;
  onReady: (draft: ExperimentSetDraft) => void;
  onBack: () => void;
}) {
  const [prepared, setPrepared] = useState(draft);
  const [referenceText, setReferenceText] = useState(
    draft.analysisIntent.kind === "single_cohort" &&
      draft.analysisIntent.referenceValue !== undefined
      ? String(draft.analysisIntent.referenceValue)
      : "",
  );
  const single = prepared.conditions.length === 1;
  const compareReference =
    prepared.analysisIntent.kind === "single_cohort" &&
    prepared.analysisIntent.mode === "one_sample";
  const referenceValid = referenceText.trim() !== "" && Number.isFinite(Number(referenceText));
  const normalizationValid = prepared.readouts.every((readout) => {
    const plan = readout.withinExperimentNormalization;
    if (!plan) return true;
    return (
      prepared.conditionAssignment.kind === "matched" &&
      prepared.conditions.length > 1 &&
      (plan.method !== "control_equals_one" ||
        prepared.conditions.some(({ id }) => id === plan.baselineConditionId))
    );
  });
  const setNormalization = (
    id: string,
    normalization: ReadoutDraft["withinExperimentNormalization"],
  ) =>
    setPrepared((current) => ({
      ...current,
      readouts: current.readouts.map((readout) =>
        readout.id === id ? { ...readout, withinExperimentNormalization: normalization } : readout,
      ),
    }));
  return (
    <section className="page-stack narrow-page" aria-labelledby="analysis-preparation-heading">
      <button type="button" onClick={onBack}>
        ← 実験内容へ戻る
      </button>
      <h1 id="analysis-preparation-heading">入力前の計算・解析設定</h1>
      <p>元の測定値を保持します。ここでは解析を実行しません。</p>
      {single ? (
        <fieldset>
          <legend>1条件のデータで何を確認しますか？</legend>
          <label>
            <input
              type="radio"
              name="single-cohort-plan"
              checked={!compareReference}
              onChange={() =>
                setPrepared((current) => ({
                  ...current,
                  analysisIntent: { kind: "single_cohort", mode: "descriptive" },
                }))
              }
            />
            記述統計とGraphのみ
          </label>
          <label>
            <input
              type="radio"
              name="single-cohort-plan"
              checked={compareReference}
              onChange={() =>
                setPrepared((current) => ({
                  ...current,
                  analysisIntent: { kind: "single_cohort", mode: "one_sample" },
                }))
              }
            />
            既知の基準値と比較する
          </label>
          {compareReference ? (
            <label>
              基準値（必須）
              <input
                aria-label="one-sample基準値"
                type="number"
                step="any"
                value={referenceText}
                onChange={(event) => setReferenceText(event.target.value)}
              />
            </label>
          ) : null}
          <p>
            基準値を明示した場合だけone-sample
            t-testを候補にします。生物学的なnなどの実行条件はデータ入力後に確認します。
          </p>
        </fieldset>
      ) : null}
      {prepared.readouts
        .filter(({ shape }) => shape === "wb_ratio")
        .map((readout) => {
          const plan = readout.withinExperimentNormalization;
          const allowed =
            prepared.conditionAssignment.kind === "matched" && prepared.conditions.length > 1;
          return (
            <fieldset key={readout.id}>
              <legend>{readout.label}：target/reference後の追加正規化</legend>
              <label>
                追加正規化
                <select
                  aria-label={`${readout.label}の追加正規化`}
                  value={plan?.method ?? "none"}
                  onChange={(event) =>
                    setNormalization(
                      readout.id,
                      event.target.value === "none"
                        ? undefined
                        : event.target.value === "control_equals_one"
                          ? {
                              method: "control_equals_one",
                              baselineConditionId: "",
                            }
                          : { method: "per_unit_maximum" },
                    )
                  }
                >
                  <option value="none">なし（target/reference比まで）</option>
                  <option value="control_equals_one" disabled={!allowed}>
                    同じ実験単位・ブロック内の対照＝1
                  </option>
                  <option value="per_unit_maximum" disabled={!allowed}>
                    同じ実験単位・ブロック内の最大値＝1
                  </option>
                </select>
              </label>
              {plan?.method === "control_equals_one" ? (
                <label>
                  正規化の対照
                  <select
                    aria-label={`${readout.label}の正規化対照`}
                    value={plan.baselineConditionId}
                    onChange={(event) =>
                      setNormalization(readout.id, {
                        method: "control_equals_one",
                        baselineConditionId: event.target.value,
                      })
                    }
                  >
                    <option value="">対照の条件を選んでください</option>
                    {prepared.conditions.map((condition) => (
                      <option key={condition.id} value={condition.id}>
                        {condition.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!allowed ? (
                <p>
                  条件間で同じ実験単位・ブロックの対応が明示されていないため、実験内の対照や最大値は指定できません。行順から対応を推測しません。
                </p>
              ) : null}
              <p>
                生値とtarget/reference比を残し、追加正規化は別の計算として保存します。分母が0・欠測の場合は計算できません。
              </p>
            </fieldset>
          );
        })}
      <button
        type="button"
        disabled={(compareReference && !referenceValid) || !normalizationValid}
        onClick={() =>
          onReady({
            ...prepared,
            ...(single
              ? {
                  analysisIntent: compareReference
                    ? {
                        kind: "single_cohort" as const,
                        mode: "one_sample" as const,
                        referenceValue: Number(referenceText),
                      }
                    : { kind: "single_cohort" as const, mode: "descriptive" as const },
                }
              : {}),
          })
        }
      >
        この設定で入力表へ進む
      </button>
    </section>
  );
}
