import {
  helpTopicForMethod,
  scientificHelpTopic,
  type ScientificHelpTopic,
  type ScientificHelpTopicId,
} from "./scientificHelpGlossary";

export type HelpSurface =
  "home" | "design" | "data" | "statistics" | "graph" | "methods" | "warning";

/**
 * Deliberately small, read-only metadata boundary for Help. Raw observations,
 * free-text project notes, file paths, and result values do not belong here.
 */
export type ContextualHelpContext = Readonly<{
  surface: HelpSurface;
  readoutType?: string;
  experimentalUnit?: string;
  biologicalN?: number;
  paired?: boolean;
  nested?: boolean;
  timeStructure?: "none" | "longitudinal" | "cross_sectional" | "repeated_state";
  selectedMethod?: string;
  warningCode?: string;
  transformation?: "auc" | "endpoint" | "baseline_change" | "f_over_f0";
}>;

export type ContextualHelpSuggestion = Readonly<{
  topic: ScientificHelpTopic;
  reason: string;
}>;

const TRANSFORMATION_TOPICS: Readonly<
  Record<NonNullable<ContextualHelpContext["transformation"]>, ScientificHelpTopicId>
> = {
  auc: "auc",
  endpoint: "endpoint",
  baseline_change: "baseline-change",
  f_over_f0: "f-over-f0",
};

export function contextualHelpSuggestions(
  context: ContextualHelpContext,
): readonly ContextualHelpSuggestion[] {
  const suggestions = new Map<ScientificHelpTopicId, string>();
  const add = (id: ScientificHelpTopicId, reason: string) => {
    if (!suggestions.has(id)) suggestions.set(id, reason);
  };

  if (context.surface === "design" || context.surface === "data") {
    add("experimental-unit", "現在の実験設計に関係する用語");
    add("biological-n", "解析で数える独立単位を確認");
  }
  if (context.paired) add("paired", "対応づけた実験単位を使用");
  if (context.nested) add("nested", "下位観測を含む階層構造");
  if (context.timeStructure === "longitudinal") {
    add("longitudinal", "同じ実験単位を時間追跡");
    add("repeated-measures", "反復identityを保持");
  }
  if (context.timeStructure === "cross_sectional") {
    add("cross-sectional", "時点ごとに異なる実験単位");
  }
  if (context.timeStructure === "repeated_state") {
    add("repeated-measures", "同じ実験単位を複数状態で測定");
  }
  if (context.transformation) {
    add(TRANSFORMATION_TOPICS[context.transformation], "選択中のデータ要約");
  }
  const methodTopic = helpTopicForMethod(context.selectedMethod);
  if (methodTopic) add(methodTopic, "選択中の解析方法");
  if (context.warningCode?.includes("sphericity")) {
    add("sphericity", "現在表示されている警告");
  }
  if (context.warningCode?.includes("multiple") || context.warningCode?.includes("multiplicity")) {
    add("multiple-comparisons", "現在表示されている警告");
  }
  if (context.surface === "statistics" && suggestions.size === 0) {
    add("confidence-interval", "統計結果の読み方");
    add("multiple-comparisons", "複数の比較を行うときの注意");
  }
  if (context.surface === "graph" && suggestions.size === 0) {
    add("sd", "ばらつき表示の読み方");
    add("confidence-interval", "不確実性表示の読み方");
  }
  if (suggestions.size === 0) {
    add("experimental-unit", "解析を始める前の基本用語");
    add("biological-n", "解析を始める前の基本用語");
  }

  return [...suggestions].slice(0, 5).map(([id, reason]) => ({
    topic: scientificHelpTopic(id),
    reason,
  }));
}
