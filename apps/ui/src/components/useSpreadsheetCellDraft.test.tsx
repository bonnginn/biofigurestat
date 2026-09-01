import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSpreadsheetCellDraft } from "./useSpreadsheetCellDraft";

describe("useSpreadsheetCellDraft", () => {
  it("synchronizes a clean visible draft to the canonical value", () => {
    const view = renderHook(({ value }) => useSpreadsheetCellDraft(value), {
      initialProps: { value: "1.0" },
    });

    view.rerender({ value: "1.5" });

    expect(view.result.current.text).toBe("1.5");
    expect(view.result.current.dirty).toBe(false);
  });

  it("retains an uncommitted identity draft when unrelated canonical state changes", () => {
    const view = renderHook(
      ({ value }) => useSpreadsheetCellDraft(value, { preserveDirtyOnCanonicalChange: true }),
      { initialProps: { value: "Mouse 1" } },
    );

    act(() => view.result.current.edit("Mouse A"));
    view.rerender({ value: "Mouse 1 normalized" });

    expect(view.result.current.text).toBe("Mouse A");
    expect(view.result.current.dirty).toBe(true);
  });

  it("clears an error on edit and resumes canonical synchronization after acceptance", () => {
    const view = renderHook(
      ({ value }) => useSpreadsheetCellDraft(value, { preserveDirtyOnCanonicalChange: true }),
      { initialProps: { value: "Unit 1" } },
    );

    act(() => view.result.current.reportError("duplicate"));
    act(() => view.result.current.edit("Unit 2"));
    expect(view.result.current.error).toBeNull();
    act(() => view.result.current.accept());
    view.rerender({ value: "Unit 2" });

    expect(view.result.current.text).toBe("Unit 2");
    expect(view.result.current.dirty).toBe(false);
  });
});
