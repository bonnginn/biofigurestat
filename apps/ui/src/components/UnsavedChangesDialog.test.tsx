import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

it("shows the unsaved-changes decision without Japanese application copy in English mode", () => {
  act(() => setAppLocale("en"));
  const view = render(
    <UnsavedChangesDialog
      actionLabel="closing this project"
      canSave
      saving={false}
      error={null}
      onSaveAndContinue={vi.fn()}
      onDiscard={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  expect(screen.getByRole("dialog", { name: "Save this experiment?" })).toBeVisible();
  expectNoJapaneseUi(view.container);
});
