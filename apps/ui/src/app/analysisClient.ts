import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AnalysisEngineResultSchema,
  type AnalysisEngineRequest,
  type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import {
  evaluationMode,
  evaluationModeIsConfigured,
  type EvaluationModeConfig,
} from "./evaluationMode";
import type { AppErrorCode } from "./errorCatalog";
import { recordDiagnosticError } from "./diagnostics";

export type AnalysisRunner = (request: AnalysisEngineRequest) => Promise<AnalysisEngineResult>;

export async function cancelLocalAnalysis(requestId: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("cancel_analysis", { requestId });
  } catch (error) {
    recordDiagnosticError("ENGINE_EXECUTION_FAILED", error);
    return false;
  }
}

export class AnalysisClientError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AnalysisClientError";
    this.code = code;
  }
}

export function createEvaluationAnalysisRunner(config: EvaluationModeConfig): AnalysisRunner {
  return async (request) => {
    if (!evaluationModeIsConfigured(config)) {
      throw new AnalysisClientError(
        "ENGINE_EXECUTION_FAILED",
        "評価用統計ブリッジが明示的に設定されていません。",
      );
    }
    try {
      const response = await fetch(`${config.apiBasePath}/analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "evaluation",
          syntheticOnly: true,
          request,
        }),
      });
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("result" in payload)
      ) {
        throw new Error("評価用ブリッジが解析結果を返しませんでした。");
      }
      return AnalysisEngineResultSchema.parse((payload as { result: unknown }).result);
    } catch (error) {
      if (error instanceof AnalysisClientError) throw error;
      recordDiagnosticError("ENGINE_EXECUTION_FAILED", error);
      throw new AnalysisClientError(
        "ENGINE_EXECUTION_FAILED",
        "評価用ブラウザから同一のローカル統計エンジンを実行できませんでした。",
        { cause: error },
      );
    }
  };
}

export function localEngineFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/ENGINE_PROCESS_TIMEOUT/u.test(detail)) {
    return "ローカル統計エンジンが制限時間内に完了しなかったため、安全に停止しました。入力したデータは保持されています。再試行しても繰り返す場合は診断情報を保存してください。";
  }
  if (/ENGINE_PROCESS_CANCELLED/u.test(detail)) {
    return "解析を中止しました。入力したデータは保持されています。";
  }
  if (/requires at least|insufficient residual degrees of freedom/i.test(detail)) {
    return "非線形fitに必要な異なるX値が不足しています。各seriesの時点数と欠損値を確認してください。入力したデータは保持されています。";
  }
  if (/flat|non-identifiable|not identifiable/i.test(detail)) {
    return "このデータでは非線形fitのparameterを一意に推定できません。変化幅と測定時点を確認してください。入力したデータは保持されています。";
  }
  if (/initial .* bounds|bound .* lower < upper/i.test(detail)) {
    return "非線形fitの初期値またはboundsが不正です。model設定を確認してください。入力したデータは保持されています。";
  }
  if (/failed:/i.test(detail)) {
    return "非線形fitが収束しませんでした。model、初期値、bounds、測定時点を確認してください。入力したデータは保持されています。";
  }
  return "ローカル解析エンジンが有効な結果を返せませんでした。入力したデータは保持されています。診断画面で「詳細を記録」を有効にすると原因を確認できます。";
}

export const defaultAnalysisRunner: AnalysisRunner = async (request) => {
  if (!isTauri()) {
    if (import.meta.env.DEV && evaluationModeIsConfigured(evaluationMode)) {
      return createEvaluationAnalysisRunner(evaluationMode)(request);
    }
    throw new AnalysisClientError(
      "ENGINE_EXECUTION_FAILED",
      "標準解析はローカルのデスクトップアプリでのみ実行できます。Tauriでプロジェクトを開いて推奨解析を実行してください。",
    );
  }

  try {
    const rawResult = await invoke<unknown>("run_analysis", { request });
    return AnalysisEngineResultSchema.parse(rawResult);
  } catch (error) {
    if (error instanceof AnalysisClientError) throw error;
    recordDiagnosticError("ENGINE_EXECUTION_FAILED", error);
    throw new AnalysisClientError("ENGINE_EXECUTION_FAILED", localEngineFailureMessage(error), {
      cause: error,
    });
  }
};
