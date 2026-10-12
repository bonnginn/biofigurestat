import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceDirtyBaseline } from "./useWorkspaceDirtyBaseline";

describe("workspace save baseline callbacks", () => {
  it("does not report a previous workspace as clean after unmount", () => {
    const report = vi.fn();
    const { result, unmount } = renderHook(() => useWorkspaceDirtyBaseline({ value: 10 }, report));
    const commit = result.current.captureSaveBaseline();
    unmount();
    report.mockClear();
    act(() => commit());
    expect(report).not.toHaveBeenCalled();
  });

  it("ignores an older completion after a newer baseline was captured", () => {
    const report = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useWorkspaceDirtyBaseline({ value }, report),
      { initialProps: { value: 10 } },
    );
    act(() => result.current.interactionCaptureProps.onChangeCapture());
    const oldCommit = result.current.captureSaveBaseline();
    rerender({ value: 99 });
    const newCommit = result.current.captureSaveBaseline();
    act(() => newCommit());
    expect(report).toHaveBeenLastCalledWith(false);
    act(() => oldCommit());
    rerender({ value: 10 });
    expect(report).toHaveBeenLastCalledWith(true);
  });
});
