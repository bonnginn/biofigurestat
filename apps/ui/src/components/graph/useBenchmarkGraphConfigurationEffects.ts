import { useEffect, useRef } from "react";
import {
  recordBenchmarkEvent,
  type BenchmarkIdentity,
} from "../../app/benchmarkEvaluation";
import { evaluationMode, evaluationModeIsConfigured } from "../../app/evaluationMode";
import {
  createBenchmarkGraphConfigurationEvent,
  type BenchmarkGraphConfigurationInput,
  type BenchmarkGraphStateLog,
} from "./experimentGraphInstrumentation";

export function useBenchmarkGraphConfigurationEffects(input: Readonly<{
  identity: BenchmarkIdentity | null;
  renderedState: string;
  analysisState: string;
  configuration: BenchmarkGraphConfigurationInput;
}>): void {
  const stateLogRef = useRef<BenchmarkGraphStateLog | null>(null);
  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      !evaluationModeIsConfigured(evaluationMode) ||
      !input.identity
    )
      return;
    const current = {
      identity: `${input.identity.caseId}:${input.identity.track}:${input.identity.runId}`,
      rendered: input.renderedState,
      analysis: input.analysisState,
    };
    const event = createBenchmarkGraphConfigurationEvent(
      stateLogRef.current,
      current,
      input.configuration,
    );
    stateLogRef.current = current;
    if (event) recordBenchmarkEvent(event.type, event.detail, event.effect);
  }, [input.analysisState, input.configuration, input.identity, input.renderedState]);
}
