import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectMetadataDraft } from "../app/projectMetadata";
import { LegacyProjectMetadataForm } from "./LegacyProjectMetadataForm";

function Harness() {
  const [value, setValue] = useState<ProjectMetadataDraft>({
    projectName: "Initial",
    experimentDate: "2026-09-01",
    operator: "",
    batch: "",
    note: "",
  });
  return (
    <>
      <LegacyProjectMetadataForm value={value} onChange={setValue} />
      <output aria-label="metadata snapshot">{JSON.stringify(value)}</output>
    </>
  );
}

describe("LegacyProjectMetadataForm", () => {
  it("updates the same metadata fields for two- and multi-condition sheets", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/プロジェクト名/u), {
      target: { value: "Revised" },
    });
    fireEvent.change(screen.getByLabelText(/実施者/u), { target: { value: "Researcher" } });
    fireEvent.change(screen.getByLabelText(/バッチ/u), { target: { value: "Batch 2" } });
    fireEvent.change(screen.getByLabelText(/メモ/u), { target: { value: "Retained note" } });

    expect(screen.getByLabelText("metadata snapshot")).toHaveTextContent(
      JSON.stringify({
        projectName: "Revised",
        experimentDate: "2026-09-01",
        operator: "Researcher",
        batch: "Batch 2",
        note: "Retained note",
      }),
    );
    expect(screen.getByLabelText(/最初の実験日/u)).toBeRequired();
  });
});
