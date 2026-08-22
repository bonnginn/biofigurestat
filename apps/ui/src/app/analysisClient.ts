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

export type AnalysisRunner = (request: AnalysisEngineRequest) => Promise<AnalysisEngineResult>;

export class AnalysisClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AnalysisClientError";
  }
}

export function createEvaluationAnalysisRunner(config: EvaluationModeConfig): AnalysisRunner {
  return async (request) => {
    if (!evaluationModeIsConfigured(config)) {
      throw new AnalysisClientError("評価用統計ブリッジが明示的に設定されていません。");
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
      throw new AnalysisClientError(
        "評価用ブラウザから同一のローカル統計エンジンを実行できませんでした。",
        { cause: error },
      );
    }
  };
}

export const defaultAnalysisRunner: AnalysisRunner = async (request) => {
  if (!isTauri()) {
    if (evaluationModeIsConfigured(evaluationMode)) {
      return createEvaluationAnalysisRunner(evaluationMode)(request);
    }
    throw new AnalysisClientError(
      "標準解析はローカルのデスクトップアプリでのみ実行できます。Tauriでプロジェクトを開いて推奨解析を実行してください。",
    );
  }

  try {
    const rawResult = await invoke<unknown>("run_analysis", { request });
    return AnalysisEngineResultSchema.parse(rawResult);
  } catch (error) {
    if (error instanceof AnalysisClientError) throw error;
    throw new AnalysisClientError(
      "ローカル解析エンジンが有効な結果を返せませんでした。入力したデータは保持されています。",
      { cause: error },
    );
  }
};
