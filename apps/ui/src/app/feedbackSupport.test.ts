import { describe, expect, it } from "vitest";

import { resolveFeedbackFormUrl } from "./feedbackSupport";

describe("feedback support boundary", () => {
  it("accepts only a static HTTPS form URL", () => {
    expect(resolveFeedbackFormUrl("https://forms.example.test/report")).toBe(
      "https://forms.example.test/report",
    );
    expect(resolveFeedbackFormUrl("http://forms.example.test/report")).toBeNull();
    expect(resolveFeedbackFormUrl("https://user:secret@forms.example.test/report")).toBeNull();
    expect(resolveFeedbackFormUrl("https://forms.example.test/report#project-name")).toBeNull();
    expect(resolveFeedbackFormUrl(undefined)).toBeNull();
  });
});
