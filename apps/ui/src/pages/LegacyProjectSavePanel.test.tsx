import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests } from "../app/appLocale";
import type { ProjectMetadataDraft } from "../app/projectMetadata";
import { LegacyProjectSavePanel } from "./LegacyProjectSavePanel";

const completeMetadata: ProjectMetadataDraft = {
  projectName: "Example",
  experimentDate: "2026-09-01",
  operator: "",
  batch: "",
  note: "",
};

describe("LegacyProjectSavePanel", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));
  afterEach(() => {
    cleanup();
    resetAppLocaleForTests("ja");
  });

  it("uses the shared save action and keeps raw-revision context on the two-condition surface", () => {
    const onSave = vi.fn();
    render(
      <LegacyProjectSavePanel
        idPrefix="workflow"
        metadata={completeMetadata}
        onMetadataChange={vi.fn()}
        canSave
        validated
        saveStatus="idle"
        saveError={null}
        onSave={onSave}
        mode="two-condition"
        activeRawRevisionId="raw.2"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole("note")).toHaveTextContent("raw.2");
  });

  it("exposes the shared metadata and save surface entirely in English", () => {
    resetAppLocaleForTests("en");
    render(
      <LegacyProjectSavePanel
        idPrefix="multi-workflow"
        metadata={completeMetadata}
        onMetadataChange={vi.fn()}
        canSave
        validated
        saveStatus="success"
        saveError={null}
        onSave={vi.fn()}
        mode="multi-condition"
      />,
    );

    expect(screen.getByText("Project information")).toBeInTheDocument();
    expect(screen.getByLabelText(/Project name/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/First experiment date/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save project" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Project saved.");
    expect(document.body.textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
  });
});
