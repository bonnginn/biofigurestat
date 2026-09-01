import type { KeyboardEvent } from "react";

import { nextRovingTabIndex } from "../components/rovingTab";
import {
  LEGACY_WORKFLOW_TABS,
  type LegacyWorkflowTabId,
} from "./legacyDataSheetShared";

type LegacyDataSheetWorkflowTabsProps = Readonly<{
  idPrefix: string;
  activeTab: LegacyWorkflowTabId;
  validated: boolean;
  analysisComplete: boolean;
  graphComplete: boolean;
  saved: boolean;
  onSelect: (tab: LegacyWorkflowTabId) => void;
}>;

function statusFor(
  tab: LegacyWorkflowTabId,
  state: Pick<
    LegacyDataSheetWorkflowTabsProps,
    "validated" | "analysisComplete" | "graphComplete" | "saved"
  >,
): string {
  if (tab === "input") return state.validated ? "検証済み" : "未入力";
  if (tab === "analysis") {
    return state.analysisComplete ? "解析済み" : state.validated ? "検証済み" : "未入力";
  }
  if (tab === "graph") return state.graphComplete ? "解析済み" : "未入力";
  return state.saved ? "保存済み" : state.validated ? "検証済み" : "未入力";
}

export function LegacyDataSheetWorkflowTabs(props: LegacyDataSheetWorkflowTabsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = nextRovingTabIndex(event.key, currentIndex, LEGACY_WORKFLOW_TABS.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = LEGACY_WORKFLOW_TABS[nextIndex].id;
    props.onSelect(nextTab);
    document.getElementById(`${props.idPrefix}-tab-${nextTab}`)?.focus();
  };

  return (
    <nav className="workflow-tabs" aria-label="解析ワークフロー" role="tablist">
      {LEGACY_WORKFLOW_TABS.map(({ id, label }, index) => (
        <button
          key={id}
          id={`${props.idPrefix}-tab-${id}`}
          className={`workflow-tab ${props.activeTab === id ? "is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={props.activeTab === id}
          aria-controls={`${props.idPrefix}-panel-${id}`}
          tabIndex={props.activeTab === id ? 0 : -1}
          onClick={() => props.onSelect(id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <span>{label}</span>
          <small>{statusFor(id, props)}</small>
        </button>
      ))}
    </nav>
  );
}
