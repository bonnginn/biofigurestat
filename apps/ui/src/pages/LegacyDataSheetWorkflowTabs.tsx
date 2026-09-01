import type { KeyboardEvent } from "react";

import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";
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
  locale: AppLocale,
): string {
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  if (tab === "input") return state.validated ? t("検証済み", "Validated") : t("未入力", "Not entered");
  if (tab === "analysis") {
    return state.analysisComplete
      ? t("解析済み", "Analyzed")
      : state.validated
        ? t("検証済み", "Validated")
        : t("未入力", "Not entered");
  }
  if (tab === "graph") return state.graphComplete ? t("解析済み", "Analyzed") : t("未入力", "Not entered");
  return state.saved
    ? t("保存済み", "Saved")
    : state.validated
      ? t("検証済み", "Validated")
      : t("未入力", "Not entered");
}

export function LegacyDataSheetWorkflowTabs(props: LegacyDataSheetWorkflowTabsProps) {
  const locale = useAppLocale();
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = nextRovingTabIndex(event.key, currentIndex, LEGACY_WORKFLOW_TABS.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = LEGACY_WORKFLOW_TABS[nextIndex].id;
    props.onSelect(nextTab);
    document.getElementById(`${props.idPrefix}-tab-${nextTab}`)?.focus();
  };

  return (
    <nav
      className="workflow-tabs"
      aria-label={localizedText(locale, "解析ワークフロー", "Analysis workflow")}
      role="tablist"
    >
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
          <span>{localizedText(locale, label.ja, label.en)}</span>
          <small>{statusFor(id, props, locale)}</small>
        </button>
      ))}
    </nav>
  );
}
