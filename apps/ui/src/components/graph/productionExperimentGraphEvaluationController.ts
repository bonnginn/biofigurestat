export function useExperimentGraphEvaluationController() {
  return Object.freeze({
    status: null,
    actionLabel: null,
    actionDisabled: true,
    finalize: async () => undefined,
  });
}
