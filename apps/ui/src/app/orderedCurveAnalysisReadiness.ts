import type { AxisMaterialRelationship, OrderedAxisMeaning } from "@lsaa/adaptive-input";

import type { NonlinearModelId } from "./nonlinearModelRegistry";

export type MichaelisReadoutMeaning =
  "calculated_initial_velocity" | "raw_time_series_or_other" | "unknown";

export type OrderedCurveAnalysisReadiness = Readonly<{
  status:
    | "ready"
    | "ready_descriptive_only"
    | "needs_model_selection"
    | "needs_targeted_confirmation"
    | "safe_stop";
  reasonCode:
    | "ORDERED_CURVE_MODEL_EXPLICITLY_SELECTED"
    | "REPEATED_TRAJECTORY_DESCRIPTIVE_FIT_ONLY"
    | "ORDERED_CURVE_MODEL_SELECTION_REQUIRED"
    | "ORDERED_CURVE_AXIS_MEANING_REQUIRED_BEFORE_MODEL"
    | "MICHAELIS_MENTEN_REQUIRES_SUBSTRATE_CONCENTRATION_AXIS"
    | "SUBSTRATE_CONCENTRATION_REQUIRES_COMPATIBLE_MODEL"
    | "MICHAELIS_MENTEN_INITIAL_VELOCITY_CONFIRMATION_REQUIRED"
    | "MICHAELIS_MENTEN_RAW_TIME_SERIES_NOT_COMPATIBLE";
  message: Readonly<{ ja: string; en: string }>;
  fitInterpretation: "inferential_independent_residuals" | "descriptive_point_estimate_only";
  preserveInput: true;
}>;

export type OrderedCurveAnalysisFacts = Readonly<{
  orderedAxisMeaning?: OrderedAxisMeaning;
  axisMaterialRelationship?: AxisMaterialRelationship;
  selectedModel: NonlinearModelId;
  modelExplicitlySelected: boolean;
  michaelisReadoutMeaning?: MichaelisReadoutMeaning;
}>;

const result = (
  status: OrderedCurveAnalysisReadiness["status"],
  reasonCode: OrderedCurveAnalysisReadiness["reasonCode"],
  ja: string,
  en: string,
  fitInterpretation: OrderedCurveAnalysisReadiness["fitInterpretation"] =
    "inferential_independent_residuals",
): OrderedCurveAnalysisReadiness => ({
  status,
  reasonCode,
  message: { ja, en },
  fitInterpretation,
  preserveInput: true,
});

/**
 * Validates researcher-confirmed curve semantics against a selected model.
 * It never chooses or replaces a model and never interprets free text.
 */
export function resolveOrderedCurveAnalysisReadiness(
  facts: OrderedCurveAnalysisFacts,
): OrderedCurveAnalysisReadiness {
  if (!facts.orderedAxisMeaning) {
    return result(
      "needs_targeted_confirmation",
      "ORDERED_CURVE_AXIS_MEANING_REQUIRED_BEFORE_MODEL",
      "横方向に変えたものを確認してからmodelを選んでください。入力値は保持します。",
      "Confirm what was varied along the horizontal axis before choosing a model. Entered values are preserved.",
    );
  }
  if (!facts.modelExplicitlySelected) {
    return result(
      "needs_model_selection",
      "ORDERED_CURVE_MODEL_SELECTION_REQUIRED",
      "観測Graphを確認し、使用するmodelを明示的に選んでください。アプリは軸の名前だけからmodelを決めません。",
      "Review the observed graph and explicitly choose a model. The app does not choose a model from the axis name alone.",
    );
  }
  if (facts.selectedModel === "michaelis_menten") {
    if (facts.orderedAxisMeaning !== "substrate_concentration") {
      return result(
        "safe_stop",
        "MICHAELIS_MENTEN_REQUIRES_SUBSTRATE_CONCENTRATION_AXIS",
        "Michaelis–Menten modelは基質濃度と反応初速度の関係に使います。現在の横軸とは一致しないため、別modelへ自動変更せず停止します。",
        "The Michaelis–Menten model is for substrate concentration versus initial velocity. It does not match the current axis, so the app stops without changing models.",
      );
    }
    if (!facts.michaelisReadoutMeaning || facts.michaelisReadoutMeaning === "unknown") {
      return result(
        "needs_targeted_confirmation",
        "MICHAELIS_MENTEN_INITIAL_VELOCITY_CONFIRMATION_REQUIRED",
        "Yが各基質濃度で求めた反応初速度か確認してください。吸光度などの時系列をそのままfitしません。",
        "Confirm that Y is the initial velocity calculated at each substrate concentration. Raw absorbance or other time-series values are not fitted directly.",
      );
    }
    if (facts.michaelisReadoutMeaning === "raw_time_series_or_other") {
      return result(
        "safe_stop",
        "MICHAELIS_MENTEN_RAW_TIME_SERIES_NOT_COMPATIBLE",
        "Yは各濃度の反応初速度ではありません。このmodelへ無理に当てはめず、入力値を保持して停止します。",
        "Y is not the initial velocity at each concentration. The app preserves the input and stops rather than forcing this model.",
      );
    }
    if (facts.axisMaterialRelationship === "same_physical_material_across_axis") {
      return result(
        "ready_descriptive_only",
        "REPEATED_TRAJECTORY_DESCRIPTIVE_FIT_ONLY",
        "同じ反応試料を順に測ったデータです。曲線の形とparameterの点推定は表示できますが、点どうしは独立ではないためSE・信頼区間・群間推論は計算しません。",
        "These values follow the same reaction material. The curve and point estimates may be shown, but standard errors, confidence intervals, and between-group inference are omitted because the points are not independent.",
        "descriptive_point_estimate_only",
      );
    }
    return result(
      "ready",
      "ORDERED_CURVE_MODEL_EXPLICITLY_SELECTED",
      "基質濃度と計算済み反応初速度に対するmodel設定です。",
      "The model is configured for substrate concentration and calculated initial velocity.",
    );
  }
  if (facts.orderedAxisMeaning === "substrate_concentration") {
    return result(
      "safe_stop",
      "SUBSTRATE_CONCENTRATION_REQUIRES_COMPATIBLE_MODEL",
      "基質濃度を横軸にしたデータと選択modelの意味が一致しません。別modelへ自動変更せず停止します。",
      "The selected model does not match a substrate-concentration axis. The app stops without changing models.",
    );
  }
  if (facts.axisMaterialRelationship === "same_physical_material_across_axis") {
    return result(
      "ready_descriptive_only",
      "REPEATED_TRAJECTORY_DESCRIPTIVE_FIT_ONLY",
      "同じ対象を順に追ったデータです。曲線の形とparameterの点推定は表示できますが、点どうしは独立ではないためSE・信頼区間・群間推論は計算しません。",
      "These values follow the same subject across the ordered axis. The curve and point estimates may be shown, but standard errors, confidence intervals, and between-group inference are omitted because the points are not independent.",
      "descriptive_point_estimate_only",
    );
  }
  return result(
    "ready",
    "ORDERED_CURVE_MODEL_EXPLICITLY_SELECTED",
    "選択したmodelを現在の順序軸へ適用します。",
    "The explicitly selected model will be applied to the current ordered axis.",
  );
}

export function orderedCurveFitCanRun(readiness: OrderedCurveAnalysisReadiness): boolean {
  return readiness.status === "ready" || readiness.status === "ready_descriptive_only";
}
