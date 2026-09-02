import type { AdaptiveLocale, TargetedConfirmation } from "@lsaa/adaptive-input";

const JAPANESE_CONFIRMATION_REASONS: Readonly<Record<TargetedConfirmation["key"], string>> = {
  relationship:
    "block・mixed・crossoverの回答は、実験単位どうしの対応関係を変更するため確認が必要です。",
  missingness: "不完全な組では、脱落・測定失敗・構造上の欠測を区別する必要があります。",
  axis_identity:
    "同じidentityが維持される範囲は、時間・距離などのordered axisごとに異なる場合があります。",
};

export function adaptiveConfirmationReason(
  locale: AdaptiveLocale,
  confirmation: Pick<TargetedConfirmation, "key" | "reason">,
): string {
  return locale === "ja" ? JAPANESE_CONFIRMATION_REASONS[confirmation.key] : confirmation.reason;
}
