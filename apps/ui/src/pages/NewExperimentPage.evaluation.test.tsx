import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../app/evaluationMode", () => ({
  evaluationMode: {
    enabled: true,
    apiBasePath: "/api/evaluation",
    sourceRevision: "fixture-revision",
  },
  evaluationModeIsConfigured: (config: { enabled: boolean; apiBasePath: string | null }) =>
    Boolean(config.enabled && config.apiBasePath?.startsWith("/")),
}));

import { NewExperimentPage } from "./NewExperimentPage";

describe("NewExperimentPage in benchmark evaluation mode", () => {
  it("requires the context-first design route instead of exposing direct demo entry", () => {
    render(<NewExperimentPage browserPreview onNavigate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "合成デモデータですぐ試す" })).toBeNull();
  });
});
