import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectTabBar } from "./ProjectTabBar";
import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

describe("ProjectTabBar", () => {
  it("shows project lifecycle controls without Japanese application copy in English mode", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <ProjectTabBar
        tabs={[{ target: "C:/a.lsa", name: "Drug response", kind: "experiment" }]}
        activeTarget="C:/a.lsa"
        activeDirty
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "+ Open" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
  it("shows saved projects, active state, dirty state, switch, close and open actions", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onOpen = vi.fn();
    render(
      <ProjectTabBar
        tabs={[
          { target: "C:/a.lsa", name: "Drug response", kind: "experiment" },
          { target: "C:/b.lsa", name: "Survival", kind: "specialized_entry_draft" },
        ]}
        activeTarget="C:/a.lsa"
        activeDirty
        onSelect={onSelect}
        onClose={onClose}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole("tab", { name: /Drug response/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("未保存の変更あり")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Survival" }));
    fireEvent.click(screen.getByRole("button", { name: "Drug responseを閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    expect(onSelect).toHaveBeenCalledWith("C:/b.lsa");
    expect(onClose).toHaveBeenCalledWith("C:/a.lsa");
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
