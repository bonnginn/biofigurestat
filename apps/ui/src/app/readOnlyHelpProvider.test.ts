import { describe, expect, it } from "vitest";

import {
  createReadOnlyHelpRequest,
  deterministicHelpProvider,
  externalHelpDisclosure,
  helpProviderMayRun,
} from "./readOnlyHelpProvider";

describe("read-only Help provider boundary", () => {
  it("whitelists minimal structured context and drops unknown raw-data fields", () => {
    const request = createReadOnlyHelpRequest({
      context: {
        surface: "statistics",
        selectedMethod: "welch_t",
        experimentalUnit: "mouse",
        biologicalN: 6,
        rawMeasurements: [1, 2, 3],
        projectNotes: "unpublished target",
      } as never,
      question: `  Why Welch? ${"x".repeat(600)}  `,
    });

    expect(request.context).toEqual({
      surface: "statistics",
      selectedMethod: "welch_t",
      experimentalUnit: "mouse",
      biologicalN: 6,
    });
    expect(request.question?.length).toBe(500);
    expect(JSON.stringify(request)).not.toContain("rawMeasurements");
    expect(JSON.stringify(request)).not.toContain("unpublished target");
  });

  it("provides deterministic local explanations without mutating context", async () => {
    const context = Object.freeze({
      surface: "statistics" as const,
      selectedMethod: "mann_whitney",
    });
    const response = await deterministicHelpProvider.explain(
      createReadOnlyHelpRequest({ context, topicId: "mann-whitney" }),
    );

    expect(deterministicHelpProvider.processing).toBe("local");
    expect(response).toMatchObject({
      providerId: "local-deterministic",
      advisory: true,
      topicIds: ["mann-whitney"],
    });
    expect(response.answer).toContain("順位と分布");
    expect(context).toEqual({ surface: "statistics", selectedMethod: "mann_whitney" });
  });

  it("defines the disclosure required before any future external provider is enabled", () => {
    expect(externalHelpDisclosure("future-provider")).toEqual({
      providerId: "future-provider",
      processing: "external",
      summary:
        "選択した画面文脈を外部AIサービスへ送信します。rawデータは含めず、回答は説明のみです。統計結果はローカルで生成されます。",
      rawMeasurementsIncluded: false,
      advisoryOnly: true,
    });
    const externalProvider = {
      id: "future-provider",
      processing: "external" as const,
      explain: deterministicHelpProvider.explain,
    };
    expect(helpProviderMayRun(externalProvider, false)).toBe(false);
    expect(helpProviderMayRun(externalProvider, true)).toBe(true);
  });
});
