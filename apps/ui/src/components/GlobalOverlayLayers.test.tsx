import { describe, expect, it } from "vitest";

import "../styles.css";
import "./AboutPanel.css";
import "./DiagnosticPanel.css";
import "./UsageTelemetryController.css";
import "./UnsavedChangesDialog.css";
import "./contextual-help.css";

function layerValue(name: string): number {
  return Number.parseInt(
    window.getComputedStyle(document.documentElement).getPropertyValue(name),
    10,
  );
}

describe("global overlay stacking contract", () => {
  it("keeps global panels above workspace overlays and the unsaved guard above global modals", () => {
    const workspaceOverlayCeiling = 40;
    const workspaceToolbar = layerValue("--layer-workspace-toolbar");
    const header = layerValue("--layer-global-header");
    const panel = layerValue("--layer-global-panel");
    const modal = layerValue("--layer-global-modal");
    const unsavedGuard = layerValue("--layer-unsaved-guard");

    expect(workspaceToolbar).toBeLessThanOrEqual(workspaceOverlayCeiling);
    expect(header).toBeGreaterThan(workspaceOverlayCeiling);
    expect(panel).toBeGreaterThan(header);
    expect(modal).toBeGreaterThan(panel);
    expect(unsavedGuard).toBeGreaterThan(modal);

    const topbar = document.createElement("header");
    topbar.className = "topbar";
    document.body.append(topbar);
    expect(window.getComputedStyle(topbar).position).toBe("relative");
    topbar.remove();
  });

  it("renders the shared workspace navigation as a compact non-wrapping toolbar", () => {
    const toolbar = document.createElement("nav");
    toolbar.className = "workspace-mode-tabs";
    const link = document.createElement("a");
    link.href = "#graph";
    link.textContent = "グラフ";
    const disabled = document.createElement("button");
    disabled.disabled = true;
    disabled.textContent = "統計";
    toolbar.append(link, disabled);
    document.body.append(toolbar);

    const toolbarStyle = window.getComputedStyle(toolbar);
    expect(toolbarStyle.display).toBe("flex");
    expect(toolbarStyle.flexWrap).toBe("nowrap");
    expect(toolbarStyle.overflowX).toBe("auto");
    expect(window.getComputedStyle(link).whiteSpace).toBe("nowrap");
    expect(window.getComputedStyle(disabled).cursor).toBe("not-allowed");

    toolbar.remove();
  });
});
