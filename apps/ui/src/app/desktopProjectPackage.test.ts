import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "@lsaa/project";

describe("candidate v5 Save As boundary", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.saveProjectStatePackage.mockReset();
    mocks.isTauri.mockReturnValue(true);
  });
  const state = {
    metadata: { projectName: "matrix fixture" },
    matrixViews: [],
  } as unknown as ProjectState;
  it("offers a new target after opening matrix state and never sends the original to storage", async () => {
    mocks.save.mockResolvedValue("C:\\QA\\matrix-new.lsa");
    mocks.saveProjectStatePackage.mockResolvedValue(state);
    const saved = await saveLocalProjectPackage(state, "C:\\QA\\original.lsa");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: "元ファイルを保全して新しい名前で保存" }),
    );
    expect(mocks.saveProjectStatePackage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "C:\\QA\\matrix-new.lsa", state }),
    );
    expect(saved?.target).toBe("C:\\QA\\matrix-new.lsa");
  });
  it("keeps the original and edited state untouched when Save As is cancelled", async () => {
    mocks.save.mockResolvedValue(null);
    const before = JSON.stringify(state);
    expect(await saveLocalProjectPackage(state, "C:\\QA\\original.lsa")).toBeNull();
    expect(mocks.saveProjectStatePackage).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });
  it("retains the existing-target behavior for matrix-free v4 projects", async () => {
    const ordinary = {
      metadata: { projectName: "ordinary" },
    } as unknown as ProjectState;
    mocks.saveProjectStatePackage.mockResolvedValue(ordinary);
    await saveLocalProjectPackage(ordinary, "C:\\QA\\ordinary.lsa");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.saveProjectStatePackage).toHaveBeenCalledWith(
      expect.objectContaining({ target: "C:\\QA\\ordinary.lsa", appVersion: PRODUCT_IDENTITY.version }),
    );
  });
});

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
  saveProjectStatePackage: vi.fn(),
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
    saveProjectStatePackage: mocks.saveProjectStatePackage,
  };
});

import {
  openLocalAnyProjectPackage,
  openLocalAnyProjectPackageAt,
  saveLocalSpecializedEntryDraftProjectPackage,
  saveLocalProjectPackage,
} from "./desktopProjectPackage";
import { PRODUCT_IDENTITY } from "./productIdentity";

describe("common .lsa desktop opener", () => {
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
    mocks.saveProjectStatePackage.mockReset();
  });

  it("shows one picker and dispatches an unresolved visualization package by manifest kind", async () => {
    const state = { projectKind: "unresolved_visualization" };
    mocks.open.mockResolvedValue("/tmp/graph-only.lsa");
    mocks.decodeProjectManifest.mockReturnValue({ projectKind: "unresolved_visualization" });
    mocks.openUnresolvedVisualizationProjectPackage.mockResolvedValue(state);

    const opened = await openLocalAnyProjectPackage();

    expect(mocks.open).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: false, multiple: false, filters: [ {name:"BioFigureStat project",extensions:["lsa"]}, {name:"すべてのファイル（.lsa projectを選択）",extensions:["*"]} ] }),
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

  it("offers a Windows-safe device-name default without renaming the saved project", async () => {
    const state = {
      projectKind: "specialized_entry_draft",
      metadata: { projectName: "CON" },
    };
    mocks.save.mockResolvedValue("C:/tmp/_CON.lsa");
    mocks.saveSpecializedEntryDraftProjectPackage.mockResolvedValue(state);
    const saved = await saveLocalSpecializedEntryDraftProjectPackage(state as never);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "_CON.lsa" }));
    expect(mocks.saveSpecializedEntryDraftProjectPackage).toHaveBeenCalledWith(
      expect.objectContaining({ state, target: "C:/tmp/_CON.lsa" }),
    );
    expect(saved?.state.metadata.projectName).toBe("CON");
  });
});
