import { render, screen, within } from "@testing-library/react";

import {
  ExperimentPatternPreview,
  type ExperimentPatternPreviewProps,
} from "./ExperimentPatternPreview";

const baseProps: ExperimentPatternPreviewProps = {
  kind: "two-condition",
  conditionLabels: ["対照", "処理"],
};

function renderPreview(overrides: Partial<ExperimentPatternPreviewProps> = {}) {
  return render(<ExperimentPatternPreview {...baseProps} {...overrides} />);
}

describe("ExperimentPatternPreview", () => {
  it.each([
    ["two-condition", "2条件の見え方"],
    ["multi-group", "多群の見え方"],
    ["repeated", "繰り返し測定の見え方"],
    ["factorial", "2種類の処置を組み合わせた見え方"],
    ["correlation", "2つの測定値の見え方"],
  ] as const)("%sの模式図を表示する", (kind, title) => {
    renderPreview({
      kind,
      conditionLabels: kind === "factorial" ? [] : ["条件X", "条件Y", "条件Z"],
      factorAName: "処置A",
      factorALevels: ["なし", "あり"],
      factorBName: "処置B",
      factorBLevels: ["−", "+"],
    });

    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });
    expect(within(preview).getByRole("heading", { name: title })).toBeVisible();
    expect(within(preview).getByText("架空データ")).toBeVisible();
    expect(preview).not.toHaveTextContent(/D0[1-9]|D10|t検定|ANOVA/);
  });

  it("入力された条件名をすぐに横軸へ反映する", () => {
    const { rerender } = renderPreview();
    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });

    expect(within(preview).getByText("対照")).toBeVisible();
    expect(within(preview).getByText("処理")).toBeVisible();

    rerender(<ExperimentPatternPreview {...baseProps} conditionLabels={["低酸素", "通常酸素"]} />);

    expect(within(preview).getByText("低酸素")).toBeVisible();
    expect(within(preview).getByText("通常酸素")).toBeVisible();
    expect(within(preview).queryByText("対照")).not.toBeInTheDocument();
  });

  it("繰り返し測定では同じ単位を線で結ぶ", () => {
    renderPreview({ kind: "repeated", conditionLabels: ["前", "中", "後"] });

    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });
    expect(preview.querySelectorAll('[data-preview-connection="true"]')).toHaveLength(4);
    expect(within(preview).getByText("前")).toBeVisible();
    expect(within(preview).getByText("後")).toBeVisible();
  });

  it("2つの処置は横軸と色系列の2段ラベルで示す", () => {
    renderPreview({
      kind: "factorial",
      conditionLabels: [],
      factorAName: "siRNA",
      factorALevels: ["Control", "siRNA #1", "siRNA #2"],
      factorBName: "薬剤",
      factorBLevels: ["−", "+"],
    });

    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });
    const labels = within(preview).getByRole("group", { name: "組み合わせ条件の2段ラベル" });
    expect(within(labels).getByText("siRNA（横軸）")).toBeVisible();
    expect(within(labels).getByText("薬剤（色系列）")).toBeVisible();
    expect(within(labels).getByText("siRNA #1")).toBeVisible();
    expect(within(labels).getAllByText("− / +")).toHaveLength(3);
    expect(within(preview).getByRole("group", { name: "薬剤の色系列" })).toBeVisible();
  });

  it("相関では入力した2つの測定名を横軸と縦軸へ置く", () => {
    renderPreview({ kind: "correlation", conditionLabels: ["蛍光強度", "細胞面積"] });

    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });
    expect(within(preview).getByText("蛍光強度")).toBeVisible();
    expect(within(preview).getByText("細胞面積")).toBeVisible();
    expect(
      within(preview).getByRole("img", { name: "2つの測定値の関係を示す架空データ模式図" }),
    ).toBeVisible();
  });
});
