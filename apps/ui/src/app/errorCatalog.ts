export const APP_ERROR_CODES = [
  "ENGINE_INPUT_INVALID",
  "ENGINE_EXECUTION_FAILED",
  "PROJECT_SAVE_FAILED",
  "PROJECT_OPEN_FAILED",
  "PROJECT_SCHEMA_UNSUPPORTED",
  "GRAPH_EXPORT_FAILED",
  "STATISTICS_STALE",
  "INVALID_PAIRED_STRUCTURE",
  "INVALID_NESTED_STRUCTURE",
  "UNSUPPORTED_ANALYSIS",
  "IMPORT_MAPPING_INVALID",
  "DIAGNOSTIC_EXPORT_FAILED",
  "UNEXPECTED_APPLICATION_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type ResearcherError = Readonly<{
  code: AppErrorCode;
  category: "user_correctable" | "application_failure";
  title: string;
  message: string;
  nextAction: string;
}>;

export const ERROR_CATALOG: Readonly<Record<AppErrorCode, ResearcherError>> = {
  ENGINE_INPUT_INVALID: {
    code: "ENGINE_INPUT_INVALID",
    category: "user_correctable",
    title: "解析入力を確認できません",
    message: "実験設計と入力値の組み合わせをローカル統計エンジンが受理できませんでした。",
    nextAction:
      "欠測、対応ID、実験単位、選択した条件を確認してください。入力値は保持されています。",
  },
  ENGINE_EXECUTION_FAILED: {
    code: "ENGINE_EXECUTION_FAILED",
    category: "application_failure",
    title: "ローカル解析を完了できません",
    message: "ローカル統計エンジンの起動または結果の検証に失敗しました。",
    nextAction: "入力を保持したまま再試行し、繰り返す場合は診断情報を保存してください。",
  },
  PROJECT_SAVE_FAILED: {
    code: "PROJECT_SAVE_FAILED",
    category: "application_failure",
    title: "プロジェクトを保存できません",
    message: "安全な保存処理を完了できませんでした。元のプロジェクトは置き換えていません。",
    nextAction: "別の保存先を選び、繰り返す場合は診断情報を保存してください。",
  },
  PROJECT_OPEN_FAILED: {
    code: "PROJECT_OPEN_FAILED",
    category: "application_failure",
    title: "プロジェクトを開けません",
    message: "プロジェクトの読込または整合性確認を完了できませんでした。",
    nextAction: "ファイルを移動せずに再試行し、診断情報と元ファイルを別々に保管してください。",
  },
  PROJECT_SCHEMA_UNSUPPORTED: {
    code: "PROJECT_SCHEMA_UNSUPPORTED",
    category: "application_failure",
    title: "この形式のプロジェクトには未対応です",
    message: "現在のアプリが安全に読み込めないschema versionです。",
    nextAction: "元ファイルを変更せず、対応するアプリversionを確認してください。",
  },
  GRAPH_EXPORT_FAILED: {
    code: "GRAPH_EXPORT_FAILED",
    category: "application_failure",
    title: "Graphを書き出せません",
    message: "Graphの描画内容は保持されていますが、ファイル作成に失敗しました。",
    nextAction: "別形式または別の保存先を試し、繰り返す場合は診断情報を保存してください。",
  },
  STATISTICS_STALE: {
    code: "STATISTICS_STALE",
    category: "user_correctable",
    title: "統計結果を更新してください",
    message: "実験設計または入力値が、最後に実行した解析から変更されています。",
    nextAction: "現在の設計を確認してから統計解析を再実行してください。",
  },
  INVALID_PAIRED_STRUCTURE: {
    code: "INVALID_PAIRED_STRUCTURE",
    category: "user_correctable",
    title: "対応関係が不完全です",
    message: "同じ対応単位に必要な条件の値が揃っていません。",
    nextAction: "対応IDと欠測を確認してください。別の観測を同じ個体として扱わないでください。",
  },
  INVALID_NESTED_STRUCTURE: {
    code: "INVALID_NESTED_STRUCTURE",
    category: "user_correctable",
    title: "入れ子構造を確認してください",
    message: "cellやROIと、それらを含む生物学的実験単位の関係を安全に確定できません。",
    nextAction: "各観測の親実験単位を明示し、cell数をbiological nとして数えないでください。",
  },
  UNSUPPORTED_ANALYSIS: {
    code: "UNSUPPORTED_ANALYSIS",
    category: "user_correctable",
    title: "この解析構造には未対応です",
    message: "現在の標準moduleでは科学的に妥当な経路を提供できません。",
    nextAction:
      "実験構造を変更せず、対応moduleの追加を待つか外部の検証済み手段を使用してください。",
  },
  IMPORT_MAPPING_INVALID: {
    code: "IMPORT_MAPPING_INVALID",
    category: "user_correctable",
    title: "データの対応付けを確認できません",
    message: "列と実験単位・条件・測定項目の対応に不足または矛盾があります。",
    nextAction: "mapping previewで列の意味と実験単位を確認してください。",
  },
  DIAGNOSTIC_EXPORT_FAILED: {
    code: "DIAGNOSTIC_EXPORT_FAILED",
    category: "application_failure",
    title: "診断情報を保存できません",
    message: "診断reportのコピーまたはファイル保存に失敗しました。",
    nextAction: "保存先またはclipboard権限を確認して、もう一度試してください。",
  },
  UNEXPECTED_APPLICATION_ERROR: {
    code: "UNEXPECTED_APPLICATION_ERROR",
    category: "application_failure",
    title: "予期しない問題が発生しました",
    message: "入力データを変更せずに処理を停止しました。",
    nextAction: "画面を閉じる前に診断情報を保存してください。",
  },
};

const ENGLISH_ERROR_CATALOG: Readonly<Record<AppErrorCode, ResearcherError>> = {
  ENGINE_INPUT_INVALID: {
    code: "ENGINE_INPUT_INVALID",
    category: "user_correctable",
    title: "The analysis input could not be validated",
    message: "The local statistics engine could not accept this combination of design and values.",
    nextAction:
      "Review missing values, matched IDs, experimental units, and selected conditions. Entered values are retained.",
  },
  ENGINE_EXECUTION_FAILED: {
    code: "ENGINE_EXECUTION_FAILED",
    category: "application_failure",
    title: "The local analysis could not be completed",
    message: "The local statistics engine could not start or its result could not be validated.",
    nextAction: "Retry without changing the input. If it recurs, save diagnostic information.",
  },
  PROJECT_SAVE_FAILED: {
    code: "PROJECT_SAVE_FAILED",
    category: "application_failure",
    title: "The project could not be saved",
    message: "Safe saving did not complete. The original project was not replaced.",
    nextAction: "Choose another destination. If it recurs, save diagnostic information.",
  },
  PROJECT_OPEN_FAILED: {
    code: "PROJECT_OPEN_FAILED",
    category: "application_failure",
    title: "The project could not be opened",
    message: "Project loading or integrity validation did not complete.",
    nextAction:
      "Retry without moving the file, and keep the diagnostic information separate from the original file.",
  },
  PROJECT_SCHEMA_UNSUPPORTED: {
    code: "PROJECT_SCHEMA_UNSUPPORTED",
    category: "application_failure",
    title: "This project format is not supported",
    message: "Its schema version cannot be loaded safely by this app version.",
    nextAction: "Keep the original file unchanged and check which app version supports it.",
  },
  GRAPH_EXPORT_FAILED: {
    code: "GRAPH_EXPORT_FAILED",
    category: "application_failure",
    title: "The Graph could not be exported",
    message: "The Graph remains unchanged, but the output file could not be created.",
    nextAction: "Try another format or destination. If it recurs, save diagnostic information.",
  },
  STATISTICS_STALE: {
    code: "STATISTICS_STALE",
    category: "user_correctable",
    title: "Update the statistical results",
    message: "The design or values have changed since the last analysis.",
    nextAction: "Review the current design and run the analysis again.",
  },
  INVALID_PAIRED_STRUCTURE: {
    code: "INVALID_PAIRED_STRUCTURE",
    category: "user_correctable",
    title: "The matched structure is incomplete",
    message: "A matched unit does not have values for every required condition.",
    nextAction:
      "Review matched IDs and missingness. Do not treat different observations as the same subject.",
  },
  INVALID_NESTED_STRUCTURE: {
    code: "INVALID_NESTED_STRUCTURE",
    category: "user_correctable",
    title: "Review the nested structure",
    message:
      "The relationship between cells or ROIs and their biological experimental units cannot be determined safely.",
    nextAction:
      "Specify the parent experimental unit for each observation. Do not count cells as biological n.",
  },
  UNSUPPORTED_ANALYSIS: {
    code: "UNSUPPORTED_ANALYSIS",
    category: "user_correctable",
    title: "This analysis structure is not supported",
    message: "The current standard module cannot provide a scientifically valid route.",
    nextAction:
      "Keep the design unchanged and wait for a supported module or use an externally validated method.",
  },
  IMPORT_MAPPING_INVALID: {
    code: "IMPORT_MAPPING_INVALID",
    category: "user_correctable",
    title: "The data mapping could not be validated",
    message:
      "Column mappings to experimental units, conditions, or readouts are incomplete or inconsistent.",
    nextAction: "Review column meaning and experimental units in the mapping preview.",
  },
  DIAGNOSTIC_EXPORT_FAILED: {
    code: "DIAGNOSTIC_EXPORT_FAILED",
    category: "application_failure",
    title: "Diagnostic information could not be saved",
    message: "The diagnostic report could not be copied or saved.",
    nextAction: "Check the destination or clipboard permission and try again.",
  },
  UNEXPECTED_APPLICATION_ERROR: {
    code: "UNEXPECTED_APPLICATION_ERROR",
    category: "application_failure",
    title: "An unexpected problem occurred",
    message: "Processing stopped without changing the entered data.",
    nextAction: "Save diagnostic information before closing the screen.",
  },
};

export function researcherError(code: AppErrorCode, locale: "ja" | "en" = "ja"): ResearcherError {
  return locale === "en" ? ENGLISH_ERROR_CATALOG[code] : ERROR_CATALOG[code];
}
