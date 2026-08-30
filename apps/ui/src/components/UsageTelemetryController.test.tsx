import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordUsageMilestone,
  resetUsageTelemetryForTest,
  serializeLocalUsageTelemetryReport,
  setUsageConsent,
} from "../app/usageTelemetry";
import { UsageTelemetryController } from "./UsageTelemetryController";

describe("UsageTelemetryController", () => {
  beforeEach(() => act(() => resetUsageTelemetryForTest()));
  afterEach(() => act(() => resetUsageTelemetryForTest()));

  it("requires an explicit first-run Yes or No choice", () => {
    const { rerender } = render(<UsageTelemetryController route="home" />);
    expect(
      screen.getByRole("dialog", { name: /研究データを含まない利用情報/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/測定値、表の内容、実験名/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("記録項目と送信について詳しく見る"));
    expect(screen.getByText(/複数回の利用をまとめるためのランダムなアプリID/)).toBeInTheDocument();
    expect(screen.getByText(/起動ごとのセッションID、操作日時/)).toBeInTheDocument();
    expect(screen.getByText(/送信先が設定されていない/)).toBeInTheDocument();
    expect(screen.getByText(/未送信情報とランダムなアプリIDを削除/)).toBeInTheDocument();
    expect(screen.queryByText(/匿名/)).toBeNull();
    expect(screen.getByRole("dialog")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "協力しない" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(serializeLocalUsageTelemetryReport()).eventCount).toBe(0);

    act(() => setUsageConsent("opted_in"));
    rerender(<UsageTelemetryController route="new-experiment" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(serializeLocalUsageTelemetryReport()).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "route_view",
          route: "new-experiment",
          entryFamily: "experiment_interview",
        }),
      ]),
    );
  });

  it("aggregates control use without retaining the control value or label", () => {
    act(() => setUsageConsent("opted_in"));
    render(
      <>
        <UsageTelemetryController route="new-experiment" />
        <label>
          Secret experiment label
          <input defaultValue="unpublished measurement 123.4" />
        </label>
      </>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "still unpublished 567.8" },
    });

    const report = serializeLocalUsageTelemetryReport();
    expect(report).toContain('"category": "form_control"');
    expect(report).not.toContain("Secret experiment label");
    expect(report).not.toContain("unpublished");
    expect(report).not.toContain("567.8");
  });

  it("records only a fixed biological-interview area instead of field text or values", () => {
    act(() => setUsageConsent("opted_in"));
    render(
      <>
        <UsageTelemetryController route="new-experiment" />
        <section data-usage-area="unit_relationship">
          <label>
            Secret donor preparation
            <input defaultValue="Donor-PRIVATE-42" />
          </label>
        </section>
      </>,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "still-private" } });

    const report = serializeLocalUsageTelemetryReport();
    expect(report).toContain('"category": "unit_relationship"');
    expect(report).not.toContain("Secret donor preparation");
    expect(report).not.toContain("Donor-PRIVATE-42");
    expect(report).not.toContain("still-private");
  });

  it("does not record uncaught failures before consent or after opt-out", () => {
    const rendered = render(<UsageTelemetryController route="new-experiment" />);
    const uncaught = new Event("error");
    Object.defineProperties(uncaught, {
      message: { value: "PRIVATE-MEASUREMENT-123.45" },
      filename: { value: "C:/PRIVATE-STUDY/raw-values.csv" },
      stack: { value: "PRIVATE-SAMPLE-ID" },
    });
    window.dispatchEvent(uncaught);
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", {
      value: new Error("PRIVATE-REJECTION-REASON"),
    });
    window.dispatchEvent(rejection);
    expect(JSON.parse(serializeLocalUsageTelemetryReport()).eventCount).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "協力しない" }));
    rendered.rerender(<UsageTelemetryController route="new-experiment" />);
    const afterOptOut = new Event("error");
    Object.defineProperty(afterOptOut, "message", { value: "PRIVATE-AFTER-OPTOUT" });
    window.dispatchEvent(afterOptOut);
    window.dispatchEvent(rejection);
    expect(JSON.parse(serializeLocalUsageTelemetryReport()).eventCount).toBe(0);
  });

  it("records only a fixed code for uncaught errors and rejections after opt-in", () => {
    act(() => setUsageConsent("opted_in"));
    const rendered = render(<UsageTelemetryController route="home" />);
    // A route change must replace, not accumulate, the window listeners.
    rendered.rerender(<UsageTelemetryController route="new-experiment" />);

    const uncaught = new Event("error");
    Object.defineProperties(uncaught, {
      message: { value: "PRIVATE-MEASUREMENT-678.90" },
      filename: { value: "C:/PRIVATE-STUDY/secret-table.csv" },
      stack: { value: "PRIVATE-ERROR-STACK" },
    });
    window.dispatchEvent(uncaught);
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", {
      value: new Error("PRIVATE-REJECTION-PAYLOAD"),
    });
    window.dispatchEvent(rejection);

    const report = serializeLocalUsageTelemetryReport();
    const parsed = JSON.parse(report) as {
      events: readonly { kind: string; route: string; code?: string }[];
    };
    expect(
      parsed.events.filter(
        ({ kind, code }) => kind === "error" && code === "UNEXPECTED_APPLICATION_ERROR",
      ),
    ).toHaveLength(2);
    expect(parsed.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "error",
          route: "new-experiment",
          code: "UNEXPECTED_APPLICATION_ERROR",
        }),
      ]),
    );
    expect(report).not.toContain("PRIVATE-");
    expect(report).not.toContain("678.90");
    expect(report).not.toContain("secret-table.csv");
  });

  it("keeps early milestones during a long local-only session until report or route cleanup", () => {
    vi.useFakeTimers();
    try {
      act(() => setUsageConsent("opted_in"));
      const rendered = render(
        <>
          <UsageTelemetryController route="home" />
          <button type="button">操作する</button>
        </>,
      );
      act(() => recordUsageMilestone("home", "structure_ready"));
      const button = screen.getByRole("button", { name: "操作する" });

      for (let index = 0; index < 130; index += 1) {
        fireEvent.click(button);
        act(() => vi.advanceTimersByTime(30_000));
      }

      const report = JSON.parse(serializeLocalUsageTelemetryReport()) as {
        events: readonly { kind: string; milestone?: string }[];
      };
      expect(report.events).toContainEqual(
        expect.objectContaining({ kind: "task_milestone", milestone: "structure_ready" }),
      );
      rendered.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes the background inert and contains keyboard focus until a choice is made", () => {
    render(
      <div className="app-shell">
        <main data-testid="background-content">
          <button type="button">Background action</button>
        </main>
        <UsageTelemetryController route="home" />
      </div>,
    );

    const background = screen.getByTestId("background-content");
    const dialog = screen.getByRole("dialog");
    const decline = screen.getByRole("button", { name: "協力しない" });
    const accept = screen.getByRole("button", { name: "協力する" });
    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(decline).toHaveFocus();

    accept.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(decline).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(accept).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(decline);
    expect(background).not.toHaveAttribute("inert");
    expect(background).not.toHaveAttribute("aria-hidden");
  });
});
