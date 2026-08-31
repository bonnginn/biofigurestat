import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { LocalizedFileInput } from "./LocalizedFileInput";

afterEach(() => resetAppLocaleForTests("ja"));

it("keeps file-picker copy in the selected application language", () => {
  setAppLocale("en");
  const onChange = vi.fn();
  render(
    <LocalizedFileInput
      label="Load data file"
      ariaLabel="Data file"
      accept=".csv,text/csv"
      onChange={onChange}
    />,
  );

  expect(screen.getByText("Choose file")).toBeVisible();
  expect(screen.getByText("No file selected")).toBeVisible();
  const input = screen.getByLabelText("Data file");
  expect(input).toHaveClass("localized-file-input__native");

  const file = new File(["x,y\n1,2"], "measurements.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });

  expect(screen.getByText("measurements.csv")).toBeVisible();
  expect(onChange).toHaveBeenCalledOnce();
});
