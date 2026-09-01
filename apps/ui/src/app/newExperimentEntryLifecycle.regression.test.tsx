import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import type { ProjectActions } from "./projectActions";
import { setUsageConsent } from "./usageTelemetry";

const SOURCE_TABLE = "Condition\tValue\nControl\t10\nDrug\t14";

function projectActions(): ProjectActions {
  return {
    openProject: vi.fn(async () => null),
    openAnyProject: vi.fn(async () => null),
    saveProject: vi.fn(async () => null),
    openUnresolvedVisualizationProject: vi.fn(async () => null),
    saveUnresolvedVisualizationProject: vi.fn(async (state) => ({
      state,
      target: "C:/tmp/entry-lifecycle.lsa",
    })),
  };
}

async function pasteGraphOnlyTable(): Promise<void> {
  fireEvent.paste(await screen.findByTestId("graph-only-cell-0-0"), {
    clipboardData: { getData: () => SOURCE_TABLE },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
    target: { value: "1" },
  });
}

async function enterBiologicalQuestionsFromGraphOnly(): Promise<void> {
  fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: "手元の表からGraphを作るを開く" },
      { timeout: 5_000 },
    ),
  );
  await pasteGraphOnlyTable();
  fireEvent.click(screen.getByRole("button", { name: "統計" }));
  fireEvent.click(
    screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
    target: { value: "no_id" },
  });
  fireEvent.click(
    screen.getByRole("radio", {
      name: /はい。各行が別々のanimal・dish・wellなどです/,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));
  expect(await screen.findByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();
}

async function cancelExitAndVerifyRawTable(): Promise<void> {
  expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
  expect(screen.getByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "戻る" }));
  expect(await screen.findByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
  expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
  expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("10");
  expect(screen.getByTestId("graph-only-cell-2-0")).toHaveValue("Drug");
  expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("14");
}

describe("new experiment cross-stage dirty lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["home", "new", "back"] as const)(
    "keeps the raw Graph-only table while %s is cancelled from biological questions",
    async (action) => {
      render(<App projectActions={projectActions()} />);
      await enterBiologicalQuestionsFromGraphOnly();

      if (action === "home") {
        fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
      } else if (action === "new") {
        fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: /実験の種類を変更/ }));
      }

      await waitFor(() =>
        expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible(),
      );
      await cancelExitAndVerifyRawTable();
    },
  );

  it("keeps the handed-off raw table when opening another Graph project is cancelled", async () => {
    render(<App projectActions={projectActions()} />);
    await enterBiologicalQuestionsFromGraphOnly();
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(await screen.findByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "データ" }));

    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("10");
    expect(screen.getByTestId("graph-only-cell-2-0")).toHaveValue("Drug");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("14");
  });

  it("guards direct condition-plan edits before the input sheet exists", async () => {
    render(<App projectActions={projectActions()} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(
      await screen.findByRole("button", { name: "実験から始めるを開く" }, { timeout: 5_000 }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "薬剤" },
    });

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByRole("textbox", { name: "処理・群分け 1の名前" })).toHaveValue("薬剤");
  });
});
