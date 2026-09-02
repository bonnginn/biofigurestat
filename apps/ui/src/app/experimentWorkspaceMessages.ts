import type { AppLocale } from "./appLocale";
import { localizedText } from "./appLocale";
import type { DraftAnalysisCorrection } from "./draftAnalysisDiagnostics";

const ANALYSIS_CORRECTION_ENGLISH: Readonly<Record<DraftAnalysisCorrection["code"], string>> = {
  MISSING_EXPERIMENTAL_UNIT_ID:
    "An experimental-unit ID is blank. Review the highlighted identity; measurements were retained.",
  DUPLICATE_EXPERIMENTAL_UNIT_ID:
    "An experimental-unit ID is duplicated. Review the highlighted identity; measurements were retained.",
  INCOMPLETE_MATCHED_SET:
    "A matched set is incomplete. Review the highlighted missing value; unmatched entries and the declared matched design were retained.",
  PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE:
    "All paired differences are identical, so the selected paired t-test cannot be computed. Review the highlighted values; no design was substituted.",
  NESTED_CONDITION_SOURCE_RELATIONSHIP_UNCONFIRMED:
    "Review whether condition-specific units came from shared material or separate source preparations. Measurements and the declared structure were retained.",
};

export function scientificSourceInvalidatedMessage(locale: AppLocale): string {
  return localizedText(
    locale,
    "データまたは実験単位の構造が変わったため、以前の解析結果・p値注釈・Methodsを外しました。グラフの見た目は保持しています。",
    "The data or experimental-unit structure changed, so previous analysis results, p-value annotations, and Methods were removed. Graph appearance was retained.",
  );
}

export function analysisCorrectionNavigationMessage(
  locale: AppLocale,
  code: DraftAnalysisCorrection["code"],
  japaneseTitle: string,
  japaneseMessage: string,
): string {
  return localizedText(
    locale,
    `${japaneseTitle}。${japaneseMessage}`,
    ANALYSIS_CORRECTION_ENGLISH[code],
  );
}

export function structureRevisionStoppedMessage(locale: AppLocale, japaneseReason: string): string {
  return localizedText(
    locale,
    japaneseReason,
    "Experiment-structure editing could not start from the current saved structure. Existing entries were retained.",
  );
}

export function structureRevisionErrorMessage(
  locale: AppLocale,
  kind: "compatibility" | "presentation" | "rebuild" | "lineage",
  japaneseReason = "",
): string {
  const japanese = {
    compatibility: `${japaneseReason} 入力済みデータは変更されていません。「変更せず戻る」で元のワークスペースへ戻れます。`,
    presentation:
      "変更後の条件表と実験構造の対応を確認できません。入力済みデータは変更されていません。",
    rebuild:
      "変更後の構造へ既存データを安全に対応づけられません。入力済みデータは変更されていません。",
    lineage: "既存データまたは元データ履歴が変わる可能性を検出したため、変更を適用しませんでした。",
  }[kind];
  const english = {
    compatibility:
      "The revised structure is not compatible with the current data. Existing entries were not changed; choose Return without changes to go back to the workspace.",
    presentation:
      "The revised condition table could not be matched safely to the experimental structure. Existing entries were not changed.",
    rebuild:
      "Existing data could not be mapped safely to the revised structure. Existing entries were not changed.",
    lineage: "The change was not applied because it could alter existing data or raw-data lineage.",
  }[kind];
  return localizedText(locale, japanese, english);
}

export function structureRevisionAppliedMessage(
  locale: AppLocale,
  graphCoordinatesStable: boolean,
): string {
  if (graphCoordinatesStable) {
    return localizedText(
      locale,
      "実験の組み立てを更新しました。測定値とGraphの外観は保持し、以前の解析結果・p値注釈・Methodsは外しました。",
      "The experimental structure was updated. Measurements and Graph appearance were retained; previous analysis results, p-value annotations, and Methods were removed.",
    );
  }
  return localizedText(
    locale,
    "実験の組み立てを更新しました。測定値は保持しましたが、条件の参照を一意に保てないGraphは安全のためワークスペースから外しました。保存済みprojectの旧履歴は残ります。",
    "The experimental structure was updated and measurements were retained. Graphs whose condition references could not remain unambiguous were removed from the workspace; earlier saved project history remains available.",
  );
}
