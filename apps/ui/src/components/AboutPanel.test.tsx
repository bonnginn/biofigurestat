import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AboutPanel } from "./AboutPanel";

describe("AboutPanel", () => {
  it("closes from an explicit control and an outside click", () => {
    render(<AboutPanel />);
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Aboutを閉じる" }));
    expect(screen.queryByLabelText("About this application")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText("About this application")).toBeNull();
  });
});
