import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import { localizedText, useAppLocale } from "../../app/appLocale";

type Props = Readonly<{
  time: ExperimentSetDraft["time"];
  plan: TimeAnalysisPlan;
  analysisTimePointId: string | null;
  hasFactorByTimeStructure: boolean;
  varyingFactorLabels: readonly string[];
}>;

export function ExperimentGraphAnalysisScopeNotice({
  time,
  plan,
  analysisTimePointId,
  hasFactorByTimeStructure,
  varyingFactorLabels,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  if (time.points.length <= 1 || plan.kind !== "selected_timepoint") return null;

  if (!analysisTimePointId) {
    return (
      <section className="experiment-graph-statistics-section">
        {hasFactorByTimeStructure ? (
          <>
            <h3>
              {t(
                "複数の処置と時間が含まれる実験です",
                "This experiment includes multiple treatments and time",
              )}
            </h3>
            <p>
              {t("現在の構造：", "Current structure: ")}
              {varyingFactorLabels.join(locale === "ja" ? "×" : " × ")}
              {t(
                "×時間。現在のCoreは、この全体の交互作用を一度に検定する因子×時間モデルに未対応です。",
                " × time. The current Core does not support a factor × time model that tests this complete interaction in one analysis.",
              )}
            </p>
            <p>
              {t(
                "時点を1つ選ぶと、その時点に限った処置因子の解析だけを実行します。これは実験全体の因子×時間交互作を検定するものではありません。",
                "Selecting one time point runs only the treatment-factor analysis at that time point. It does not test the factor × time interaction for the full experiment.",
              )}
            </p>
          </>
        ) : (
          <p>
            {t(
              "解析する時点を選ぶと、現在のデータに合う方法を確認できます。複数時点をまとめた反復・因子モデルへは自動変換しません。",
              "Select a time point to review a method suitable for the current data. BioFigureStat does not automatically convert the data to a repeated-measures or factorial model across time points.",
            )}
          </p>
        )}
      </section>
    );
  }

  if (!hasFactorByTimeStructure) return null;
  const selectedPoint = time.points.find(({ id }) => id === analysisTimePointId);
  return (
    <section className="experiment-graph-statistics-section" role="note">
      <h3>{t("今回に解析する範囲", "Scope of this analysis")}</h3>
      <p>
        {t("因子候補：", "Candidate factors: ")}
        {varyingFactorLabels.join(locale === "ja" ? "、" : ", ")}
        {t("。時間：", ". Time: ")}
        {selectedPoint?.value}
        {time.unit}
        {t(
          "のみ。この結果は因子×時間の全体モデルではありません。条件説明用の属性を自動的にプールしません。",
          " only. This result is not a full factor × time model. Attributes used to describe conditions are not pooled automatically.",
        )}
      </p>
    </section>
  );
}
