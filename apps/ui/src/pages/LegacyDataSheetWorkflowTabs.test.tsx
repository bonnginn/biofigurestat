import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests } from "../app/appLocale";
import { LegacyDataSheetWorkflowTabs } from "./LegacyDataSheetWorkflowTabs";

describe("LegacyDataSheetWorkflowTabs", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));
  afterEach(() => {
    cleanup();
    resetAppLocaleForTests("ja");
  });

  it("renders shared progress without changing the owning sheet state", () => {
    const onSelect = vi.fn();
    render(
      <LegacyDataSheetWorkflowTabs
        idPrefix="test-workflow"
        activeTab="analysis"
        validated
        analysisComplete={false}
        graphComplete={false}
        saved={false}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("tab", { name: "1 データ入力検証済み" })).toHaveAttribute(
      "aria-controls",
      "test-workflow-panel-input",
    );
    expect(screen.getByRole("tab", { name: "2 解析検証済み" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "3 グラフ未入力" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "4 保存検証済み" })).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("moves selection and focus with the shared roving-tab keyboard contract", () => {
    const onSelect = vi.fn();
    render(
      <LegacyDataSheetWorkflowTabs
        idPrefix="test-workflow"
        activeTab="input"
        validated={false}
        analysisComplete={false}
        graphComplete={false}
        saved={false}
        onSelect={onSelect}
      />,
    );
    const inputTab = screen.getByRole("tab", { name: "1 データ入力未入力" });
    const analysisTab = screen.getByRole("tab", { name: "2 解析未入力" });
    inputTab.focus();
    fireEvent.keyDown(inputTab, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("analysis");
    expect(analysisTab).toHaveFocus();
  });

  it("renders the complete workflow contract in English", () => {
    resetAppLocaleForTests("en");
    render(
      <LegacyDataSheetWorkflowTabs
        idPrefix="test-workflow"
        activeTab="save"
        validated
        analysisComplete
        graphComplete
        saved
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Analysis workflow" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "1 Data entryValidated" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "2 AnalysisAnalyzed" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "3 GraphAnalyzed" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "4 SaveSaved" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
  });
});
