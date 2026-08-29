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

    const toggle = screen.getByRole("button", { name: "Graphを全幅表示" });
    fireEvent.click(toggle);

    expect(body).toHaveAttribute("data-layout", "wide-canvas");
    expect(screen.getByLabelText("Graphと統計の設定")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graphと設定を横並び" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not repeat Graph when the supplied title already includes it", () => {
    render(
      <GraphWorkspaceFrame
        title="表から作成したGraph"
        actions={null}
        canvas={<div>Graph canvas</div>}
        inspector={<div>Settings</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "表から作成したGraph" })).toBeInTheDocument();
    expect(screen.queryByText("表から作成したGraph Graph")).not.toBeInTheDocument();
  });
});
