import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { resetAppLocaleForTests, appLocaleStorageKey } from "../app/appLocale";
vi.mock("./DiagnosticPanel", () => ({ DiagnosticPanel: () => <button>Diagnostics</button> }));
vi.mock("./AboutPanel", () => ({ AboutPanel: () => <button>About</button> }));
vi.mock("./ContextualHelp", () => ({ ContextualHelp: () => <button>Help</button> }));
vi.mock("./UsageTelemetryController", () => ({ UsageTelemetryController: () => null }));
vi.mock("../app/usageTelemetry", () => ({ useUsageConsent: () => "unknown" }));
beforeEach(() => {
  localStorage.clear();
  resetAppLocaleForTests();
});
it("switches chrome language without remounting the live input or changing navigation", () => {
  const navigate = vi.fn();
  const open = vi.fn();
  render(
    <AppShell route="home" onNavigate={navigate} onOpenProject={open}>
      <input aria-label="live draft" defaultValue="unsaved" />
    </AppShell>,
  );
  const draft = screen.getByRole("textbox", { name: "live draft" });
  fireEvent.change(draft, { target: { value: "new text" } });
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem(appLocaleStorageKey)).toBe("en");
  expect(screen.getByRole("textbox", { name: "live draft" })).toBe(draft);
  expect(draft).toHaveValue("new text");
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  expect(open).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(navigate).toHaveBeenCalledWith("home");
  expect(screen.getByText("Diagnostics")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Japanese" }));
  expect(screen.getByRole("button", { name: "新しい実験" })).toBeInTheDocument();
  expect(draft).toHaveValue("new text");
});
it("keeps the selected language usable when storage is unavailable and closes utilities on Escape", () => {
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  render(
    <AppShell route="home" onNavigate={() => {}}>
      content
    </AppShell>,
  );
  const summary = screen.getByText("ヘルプ・設定");
  const details = summary.closest("details")!;
  details.open = true;
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(document.documentElement.lang).toBe("en");
  fireEvent.keyDown(screen.getByRole("button", { name: "English" }), { key: "Escape" });
  expect(details.open).toBe(false);
  expect(summary).toHaveFocus();
  storage.mockRestore();
});
