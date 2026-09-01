import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { ExperimentGraphGroupingEditor } from "./ExperimentGraphGroupingEditor";
import {
  ExperimentGraphSelectionEditor,
  type DerivedGraphLineageRow,
  type GraphSourceMode,
} from "./ExperimentGraphSelectionEditor";

type Props = Readonly<{
  draft: ExperimentSetDraft;
  activeReadoutId: string;
  axes: WorkspaceGraphState["axes"];
  grouping: NonNullable<WorkspaceGraphState["grouping"]>;
  setGrouping: Dispatch<SetStateAction<NonNullable<WorkspaceGraphState["grouping"]>>>;
  setAppearance: Dispatch<SetStateAction<WorkspaceGraphState["appearance"]>>;
  visualSeriesCount: number;
  sourceMode: GraphSourceMode;
  timeAnalysis: TimeAnalysisPlan;
  readoutLabel: string;
  derivedLineageRows: readonly DerivedGraphLineageRow[];
  selectedTimePointIds: readonly string[];
  activeConditionIds: ReadonlySet<string>;
  onReadoutChange: (readoutId: string) => void;
  onSourceModeChange: (mode: GraphSourceMode) => void;
  onAllTimePointsChange: (checked: boolean) => void;
  onTimePointChange: (timePointId: string, checked: boolean) => void;
  onConditionChange: (conditionId: string, checked: boolean) => void;
  onEditSeriesStyles: () => void;
}>;

export function ExperimentGraphDataEditor({
  draft,
  activeReadoutId,
  axes,
  grouping,
  setGrouping,
  setAppearance,
  visualSeriesCount,
  sourceMode,
  timeAnalysis,
  readoutLabel,
  derivedLineageRows,
  selectedTimePointIds,
  activeConditionIds,
  onReadoutChange,
  onSourceModeChange,
  onAllTimePointsChange,
  onTimePointChange,
  onConditionChange,
  onEditSeriesStyles,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{t("表示するデータ", "Data to display")}</h3>
      <label className="experiment-graph-field">
        <span>{t("測定項目", "Measured readout")}</span>
        <select
          value={activeReadoutId}
          disabled={draft.readouts.length <= 1}
          aria-label={t("測定項目", "Measured readout")}
          onChange={(event) => onReadoutChange(event.currentTarget.value)}
        >
          {draft.readouts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {draft.analysisIntent.kind !== "correlation" ? (
        <ExperimentGraphGroupingEditor
          draft={draft}
          axes={axes}
          grouping={grouping}
          setGrouping={setGrouping}
          setAppearance={setAppearance}
          visualSeriesCount={visualSeriesCount}
          onEditSeriesStyles={onEditSeriesStyles}
        />
      ) : null}
      <ExperimentGraphSelectionEditor
        draft={draft}
        sourceMode={sourceMode}
        timeAnalysis={timeAnalysis}
        readoutLabel={readoutLabel}
        derivedLineageRows={derivedLineageRows}
        selectedTimePointIds={selectedTimePointIds}
        activeConditionIds={activeConditionIds}
        onSourceModeChange={onSourceModeChange}
        onAllTimePointsChange={onAllTimePointsChange}
        onTimePointChange={onTimePointChange}
        onConditionChange={onConditionChange}
      />
    </section>
  );
}
