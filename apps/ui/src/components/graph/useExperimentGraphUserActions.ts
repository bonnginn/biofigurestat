import { useState } from "react";

import type { GraphExportFeedback } from "./experimentGraphUserExports";
import { createExperimentGraphUserActions } from "./experimentGraphUserActions";

type UserActionInput = Omit<
  Parameters<typeof createExperimentGraphUserActions>[0],
  "setCopyStatus" | "setExportFeedback"
>;

export function useExperimentGraphUserActions(input: UserActionInput) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<GraphExportFeedback | null>(null);
  const actions = createExperimentGraphUserActions({
    ...input,
    setCopyStatus,
    setExportFeedback,
  });

  return { copyStatus, exportFeedback, actions };
}
