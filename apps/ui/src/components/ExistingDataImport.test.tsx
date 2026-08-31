import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";
import { ExistingDataImport } from "./ExistingDataImport";

afterEach(() => resetAppLocaleForTests("ja"));

it("shows existing-data mapping without Japanese application copy in English mode", () => {
  setAppLocale("en");
  const view = render(<ExistingDataImport onReady={vi.fn()} />);
  expectNoJapaneseUi(view.container);

  fireEvent.change(screen.getByRole("textbox", { name: "Existing data table" }), {
    target: {
      value: "Session\tUnit ID\tCondition\tValue\nExp 1\tdish-1\tControl\t1.2\nExp 1\tdish-2\tDrug\t2.4",
    },
  });
  expect(screen.getByRole("table", { name: "Import preview" })).toBeVisible();
  expectNoJapaneseUi(view.container);
});
