import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GraphWorkspaceFrame } from "./GraphWorkspaceFrame";

describe("GraphWorkspaceFrame", () => {
  it("keeps the inspector available while expanding the Graph canvas", () => {
    const { container } = render(
      <GraphWorkspaceFrame
        title="生存時間"
        actions={<button type="button">SVG</button>}
        canvas={<div>Graph canvas</div>}
        inspector={<label>Graphタイトル<input /></label>}
      />,
    );

    const body = container.querySelector(".graph-workspace-frame__body");
    expect(body).toHaveAttribute("data-layout", "side-by-side");
    expect(screen.getByLabelText("Graphと統計の設定")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Graphを広く表示" });
    fireEvent.click(toggle);

    expect(body).toHaveAttribute("data-layout", "wide-canvas");
    expect(screen.getByLabelText("Graphと統計の設定")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定を横に戻す" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
