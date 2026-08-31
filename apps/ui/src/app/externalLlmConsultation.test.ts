import { describe, expect, it } from "vitest";

import {
  createExternalLlmImprovementRequest,
  createExperimentConsultationPrompt,
  createStatisticsConsultationPrompt,
  EXTERNAL_LLM_GUIDE_URL,
} from "./externalLlmConsultation";

describe("external LLM consultation prompt boundary", () => {
  it("uses the canonical BioFigureStat repository for the versioned guide", () => {
    expect(EXTERNAL_LLM_GUIDE_URL).toContain("githubusercontent.com/bonnginn/biofigurestat/");
    expect(EXTERNAL_LLM_GUIDE_URL).toContain("/v0.1.0-alpha.1/");
    expect(EXTERNAL_LLM_GUIDE_URL).not.toContain("life-science-analysis-app");
  });

  it("creates a reviewed improvement request without claiming that the LLM answer is authoritative", () => {
    const request = createExternalLlmImprovementRequest({
      placement: "statistics",
      requestedChange: "比較目的を選ぶ説明を短くしてほしい",
      externalLlmResponse: "対照群との比較を先に確認するとよい",
    });

    expect(request).toContain("比較目的を選ぶ説明を短くしてほしい");
    expect(request).toContain("対照群との比較を先に確認するとよい");
    expect(request).toContain("参考情報・未検証");
    expect(request).toContain("BioFigureStatから自動送信されていません");
    expect(request).toContain("Statistics（統計の選択・解釈）");
  });

  it("generates a one-question-at-a-time experiment interview against the versioned guide", () => {
    const prompt = createExperimentConsultationPrompt({
      title: "siRNA rescue",
      conditionFactors: [
        { name: "siRNA", levels: ["Control", "Target"] },
        { name: "Construct", levels: ["Empty", "Rescue"] },
      ],
      measurement: "Relative viability",
      valueForm: "1つの数値",
      receiver: "culture dish",
      relationship: "条件ごとに別々",
      nestedObservation: "",
      orderedAxis: "なし",
    });

    expect(prompt).toContain(EXTERNAL_LLM_GUIDE_URL);
    expect(prompt).toContain("一度に1問ずつ");
    expect(prompt).toContain("siRNA: Control / Target");
    expect(prompt).toContain("近い別設計へ置き換えず");
  });

  it("summarizes statistics structure without embedding measurement values", () => {
    const prompt = createStatisticsConsultationPrompt({
      conditions: ["Vehicle", "Drug"],
      methodTitle: "Welch t検定を推奨",
      methodReason: "別々のdishを比較します。",
      nByCondition: { Vehicle: 4, Drug: 4 },
      missingCount: 0,
      notPlannedCount: 0,
      relationship: "条件ごとに独立",
      selectedMethod: "welch_t",
    });

    expect(prompt).toContain("Vehicle: n=4 / Drug: n=4");
    expect(prompt).toContain("測定値そのものを含めていません");
    expect(prompt).not.toContain("1.23");
  });
});
