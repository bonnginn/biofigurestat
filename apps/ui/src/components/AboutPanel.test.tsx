import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetUsageTelemetryForTest, setUsageConsent } from "../app/usageTelemetry";
import { AboutPanel } from "./AboutPanel";

describe("AboutPanel", () => {
  beforeEach(() => act(() => resetUsageTelemetryForTest()));
  afterEach(() => act(() => resetUsageTelemetryForTest()));

  it("closes from an explicit control and an outside click", () => {
    render(<AboutPanel />);
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Aboutを閉じる" }));
    expect(screen.queryByLabelText("About this application")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText("About this application")).toBeNull();
  });

  it("allows later opt-in and opt-out and explains the local-only build state", () => {
    act(() => setUsageConsent("opted_in"));
    render(<AboutPanel />);
    fireEvent.click(screen.getByRole("button", { name: "About" }));

    const toggle = screen.getByRole("checkbox", { name: /研究データを含まない利用情報/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/送信先が設定されていない/)).toBeInTheDocument();
    expect(screen.getByText(/ON時は、ランダムなアプリID/)).toBeInTheDocument();
    expect(screen.getByText(/未送信情報とランダムなアプリIDを削除/)).toBeInTheDocument();
    expect(screen.queryByText(/匿名/)).toBeNull();
    expect(screen.getByRole("button", { name: "利用情報レポートをコピー" })).toBeEnabled();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "利用情報レポートをコピー" })).toBeNull();
  });
});
