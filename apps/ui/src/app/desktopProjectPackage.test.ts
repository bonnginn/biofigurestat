import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decodeProjectManifest: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  open: vi.fn(),
  save: vi.fn(),
  openProjectStatePackage: vi.fn(),
  openUnresolvedVisualizationProjectPackage: vi.fn(),
  openSpecializedEntryDraftProjectPackage: vi.fn(),
  saveSpecializedEntryDraftProjectPackage: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
  save: mocks.save,
}));

vi.mock("@lsaa/project", async () => {
  const actual = await vi.importActual("@lsaa/project");
  return {
    ...actual,
    decodeProjectManifest: mocks.decodeProjectManifest,
    openProjectStatePackage: mocks.openProjectStatePackage,
    openUnresolvedVisualizationProjectPackage: mocks.openUnresolvedVisualizationProjectPackage,
    openSpecializedEntryDraftProjectPackage: mocks.openSpecializedEntryDraftProjectPackage,
    saveSpecializedEntryDraftProjectPackage: mocks.saveSpecializedEntryDraftProjectPackage,
  };
});

import {
  openLocalAnyProjectPackage,
  openLocalAnyProjectPackageAt,
  saveLocalSpecializedEntryDraftProjectPackage,
} from "./desktopProjectPackage";
import { setAppLocale } from "./appLocale";

describe("common .lsa desktop opener", () => {
  it("uses English native dialog titles when English is selected", async () => {
    setAppLocale("en");
    mocks.open.mockResolvedValue(null);

    await openLocalAnyProjectPackage();

    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Open BioFigureStat project" }),
    );
    setAppLocale("ja");
  });

  beforeEach(() => {
    mocks.decodeProjectManifest.mockReset();
    mocks.invoke.mockReset().mockResolvedValue([123]);
    mocks.isTauri.mockReturnValue(true);
    mocks.open.mockReset();
    mocks.save.mockReset();
    mocks.openProjectStatePackage.mockReset();
    mocks.openUnresolvedVisualizationProjectPackage.mockReset();
    mocks.openSpecializedEntryDraftProjectPackage.mockReset();
    mocks.saveSpecializedEntryDraftProjectPackage.mockReset();
  });

  it("shows one picker and dispatches an unresolved visualization package by manifest kind", async () => {
    const state = { projectKind: "unresolved_visualization" };
    mocks.open.mockResolvedValue("/tmp/graph-only.lsa");
    mocks.decodeProjectManifest.mockReturnValue({ projectKind: "unresolved_visualization" });
    mocks.openUnresolvedVisualizationProjectPackage.mockResolvedValue(state);

    const opened = await openLocalAnyProjectPackage();

    expect(mocks.open).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: false, multiple: false }),
    );
    expect(mocks.openUnresolvedVisualizationProjectPackage).toHaveBeenCalledOnce();
    expect(mocks.openProjectStatePackage).not.toHaveBeenCalled();
    expect(opened).toEqual({
      kind: "unresolved_visualization",
      project: { state, target: "/tmp/graph-only.lsa" },
    });
  });

  it("dispatches an authoritative experiment package without coercing it to a table project", async () => {
    const state = { projectKind: "experiment" };
    mocks.decodeProjectManifest.mockReturnValue({ projectKind: "experiment" });
    mocks.openProjectStatePackage.mockResolvedValue(state);

    const opened = await openLocalAnyProjectPackageAt("/tmp/experiment.lsa");

    expect(mocks.openProjectStatePackage).toHaveBeenCalledOnce();
    expect(mocks.openUnresolvedVisualizationProjectPackage).not.toHaveBeenCalled();
    expect(opened).toEqual({
      kind: "experiment",
      project: { state, target: "/tmp/experiment.lsa" },
    });
  });

  it("stops with an actionable error for a corrupt or unknown manifest kind", async () => {
    mocks.decodeProjectManifest.mockImplementation(() => {
      throw new Error("invalid projectKind");
    });

    await expect(openLocalAnyProjectPackageAt("/tmp/corrupt.lsa")).rejects.toThrow("manifest.json");
    expect(mocks.openProjectStatePackage).not.toHaveBeenCalled();
    expect(mocks.openUnresolvedVisualizationProjectPackage).not.toHaveBeenCalled();
  });

  it("does not route progressive packages through an unrelated editor", async () => {
    mocks.decodeProjectManifest.mockReturnValue({ projectKind: "progressive_experiment" });

    await expect(openLocalAnyProjectPackageAt("/tmp/in-progress.lsa")).rejects.toThrow(
      "入力途中の実験",
    );
    expect(mocks.openProjectStatePackage).not.toHaveBeenCalled();
    expect(mocks.openUnresolvedVisualizationProjectPackage).not.toHaveBeenCalled();
  });

  it("dispatches a specialized safe-stop draft to its dedicated reader", async () => {
    const state = { projectKind: "specialized_entry_draft", route: "survival" };
    mocks.decodeProjectManifest.mockReturnValue({ projectKind: "specialized_entry_draft" });
    mocks.openSpecializedEntryDraftProjectPackage.mockResolvedValue(state);

    const opened = await openLocalAnyProjectPackageAt("/tmp/survival-draft.lsa");

    expect(mocks.openSpecializedEntryDraftProjectPackage).toHaveBeenCalledOnce();
    expect(mocks.openProjectStatePackage).not.toHaveBeenCalled();
    expect(mocks.openUnresolvedVisualizationProjectPackage).not.toHaveBeenCalled();
    expect(opened).toEqual({
      kind: "specialized_entry_draft",
      project: { state, target: "/tmp/survival-draft.lsa" },
    });
  });

  it("uses the native specialized package writer without routing through SQLite", async () => {
    const state = {
      projectKind: "specialized_entry_draft",
      metadata: { projectName: "Incomplete survival" },
    };
    mocks.save.mockResolvedValue("C:/tmp/survival-draft.lsa");
    mocks.saveSpecializedEntryDraftProjectPackage.mockResolvedValue(state);

    const saved = await saveLocalSpecializedEntryDraftProjectPackage(state as never);

    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.saveSpecializedEntryDraftProjectPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "C:/tmp/survival-draft.lsa",
        state,
      }),
    );
    expect(saved).toEqual({ state, target: "C:/tmp/survival-draft.lsa" });
  });
});
