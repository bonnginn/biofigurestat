import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { NewExperimentPage } from "./NewExperimentPage";
import { createExperimentSetDraft } from "../app/experimentDraft";
import { VisualPatternGallery } from "./VisualPatternGallery";

function patternCard(id: string) {
  const card = document.querySelector(`[data-pattern="${id}"]`);
  if (!(card instanceof HTMLElement)) throw new Error(`Pattern card ${id} was not rendered`);
  return within(card);
}

describe("実験者の言葉から図の見本へ進む", () => {
  it("解析IDを見せず、3つの実験パターンだけを表示する", () => {
    render(<VisualPatternGallery onSelect={() => undefined} />);

    expect(screen.getByRole("heading", { name: "図のイメージから始める" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "別々の実験単位を群に分けた" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "同じ単位を複数条件で測定した" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "同じ単位のXとYの関係を見たい" })).toBeVisible();
    expect(document.querySelectorAll(".pattern-card")).toHaveLength(3);
    expect(screen.queryByText(/D0[1-9]/)).not.toBeInTheDocument();
    expect(screen.queryByText("条件数")).not.toBeInTheDocument();
    expect(screen.queryByText(/計画する.*n/)).not.toBeInTheDocument();
  });

  it("独立した単位のカードを既存の独立群プリセットへ渡す", () => {
    const onSelect = vi.fn();
    render(<VisualPatternGallery onSelect={onSelect} />);

    fireEvent.click(
      patternCard("independent-groups").getByRole("button", { name: "この実験から始める" }),
    );

    expect(onSelect).toHaveBeenCalledWith("microscopy", {
      templateId: "D01",
      plannedN: 3,
      conditionCount: 2,
    });
  });

  it("測定方法を切り替えても、同じ3つの実験パターンを既存の内部プリセットへ渡す", () => {
    const onSelect = vi.fn();
    render(<VisualPatternGallery onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("radio", { name: "ウェスタンブロット（WB）" }));
    fireEvent.click(
      patternCard("repeated-units").getByRole("button", { name: "この実験から始める" }),
    );
    fireEvent.click(
      patternCard("measurement-relationship").getByRole("button", {
        name: "この実験から始める",
      }),
    );

    expect(onSelect).toHaveBeenNthCalledWith(1, "western_blot", {
      templateId: "D02",
      plannedN: 3,
      conditionCount: 2,
    });
    expect(onSelect).toHaveBeenNthCalledWith(2, "western_blot", {
      templateId: "D09",
      plannedN: 5,
      conditionCount: 2,
    });
  });
});

describe("新しい実験の入口", () => {
  it("再利用した設計は入力前の確認画面から修正できる", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    render(<NewExperimentPage initialDraft={draft} onNavigate={() => undefined} />);

    expect(screen.getByRole("heading", { name: "この実験の設計を確認" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "2. 条件" }));
    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "行1：条件" })).toHaveValue("Control");
  });

  it("対照群を表示名から推測せず、条件行に明示して選べる", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      conditions: base.conditions.slice(0, 3).map((condition, index) => ({
        ...condition,
        label: ["Vehicle", "Drug A", "Drug B"][index],
        attributes: { "attribute.1": ["Vehicle", "Drug A", "Drug B"][index] },
      })),
    };
    render(<NewExperimentPage initialDraft={draft} onNavigate={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "2. 条件" }));

    const vehicleControl = screen.getByRole("radio", { name: "条件1を対照群に指定" });
    expect(vehicleControl).not.toBeChecked();
    fireEvent.click(vehicleControl);
    expect(vehicleControl).toBeChecked();
    expect(screen.getByText(/自動判定せず、選んだ条件IDを保存/)).toBeVisible();
  });
  it("研究者の文脈を入口にし、未対応の文脈は準備中として示す", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);

    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(document.querySelectorAll("[data-context]")).toHaveLength(6);
    expect(screen.queryAllByText("準備中")).toHaveLength(0);
    expect(document.querySelector('[data-context="protein_biochemical"]')).not.toBeDisabled();
    expect(document.querySelector('[data-context="animal"]')).not.toBeDisabled();
    expect(document.querySelector('[data-context="general_assay"]')).not.toBeDisabled();
    expect(screen.queryByRole("tab", { name: "図から探す（補助）" })).not.toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));
    expect(screen.getByRole("heading", { name: "何を測りましたか？" })).toBeVisible();
  });

  it("二重クリックの2回目で次の質問まで意図せず進まない", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);

    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!, { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: /その他の培養アッセイ/ }), { detail: 2 });

    expect(screen.getByRole("heading", { name: "今回、主に何を解析しましたか？" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /その他の培養アッセイ/ }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }), { detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }), { detail: 2 });

    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
  });

  it("動物実験からhumane endpointのtime-to-event入力へ到達する", () => {
    const onNavigate = vi.fn();
    render(<NewExperimentPage onNavigate={onNavigate} />);
    fireEvent.click(document.querySelector('[data-context="animal"]')!);
    fireEvent.click(screen.getByRole("button", { name: /humane endpoint・eventまでの期間/ }));
    expect(onNavigate).toHaveBeenCalledWith("survival");
  });

  it("生化学実験から非線形な反応曲線fitへ到達する", () => {
    const onNavigate = vi.fn();
    render(<NewExperimentPage onNavigate={onNavigate} />);
    fireEvent.click(document.querySelector('[data-context="protein_biochemical"]')!);
    fireEvent.click(screen.getByRole("button", { name: /時間・濃度に対する反応曲線/ }));
    expect(onNavigate).toHaveBeenCalledWith("nonlinear-fit");
  });

  it("顕微鏡を独立入口にし、Cell・ROIの階層を研究者の言葉で確認する", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="microscopy_imaging"]')!);
    expect(screen.getByRole("button", { name: /蛍光強度/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /移動・tracking/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /蛍光強度/ }));

    expect(
      screen.getByRole("group", { name: "1つの実験単位から何を入力しますか？" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /Cell・ROI値を複数/ })).toBeChecked();
    expect(screen.getByText(/個数を生物学的nにはしません/)).toBeVisible();
    expect(screen.queryByText(/D0[1-9]|Pearson|Spearman/)).not.toBeInTheDocument();
  });

  it("経時ショートカットは同じ単位を追う時間構造を初期選択する", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="animal"]')!);
    fireEvent.click(screen.getByRole("button", { name: /経時測定/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
      target: { value: "Treatment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(
      screen.getByRole("heading", { name: "条件間の試料の関係と測定軸を確認します" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /同じ単位を各時間点で測った/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "時間点" })).toBeVisible();
  });

  it("時間へ偽装せず、Radiusのような反復数値軸を設計できる", () => {
    const draft = createExperimentSetDraft("cell_culture", "nested_continuous");
    render(<NewExperimentPage initialDraft={draft} onNavigate={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "3. 測定軸" }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));
    fireEvent.click(screen.getByRole("radio", { name: /時間以外の数値軸/ }));

    expect(screen.getByRole("textbox", { name: "数値軸の名前" })).toHaveValue("Radius");
    expect(screen.getByRole("textbox", { name: "数値軸の単位" })).toHaveValue("µm");
    fireEvent.change(screen.getByRole("textbox", { name: "数値軸の水準" }), {
      target: { value: "0, 10, 20" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /同じ単位を各軸水準で測った/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "設計を確認" }));

    expect(screen.getByText("Radius (µm)・3水準（同じ単位を反復測定）")).toBeVisible();
    expect(screen.getByText("Radius")).toBeVisible();
    expect(screen.queryByText(/Radius.*時間/)).toBeNull();
  });

  it("単位のない数値covariate軸を有効な設計として扱う", () => {
    const draft = createExperimentSetDraft("cell_culture", "nested_continuous");
    render(<NewExperimentPage initialDraft={draft} onNavigate={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "3. 測定軸" }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));
    fireEvent.click(screen.getByRole("radio", { name: /時間以外の数値軸/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "数値軸の名前" }), {
      target: { value: "Covariate" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "数値軸の単位" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "数値軸の水準" }), {
      target: { value: "10, 20, 30" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /軸水準ごとに別のサンプル/ }));

    expect(screen.getByRole("button", { name: "次へ" })).toBeEnabled();
  });

  it("同じ実験セットへ複数の測定項目を追加・削除できる", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 測定項目を追加" }));
    expect(screen.getByRole("textbox", { name: "測定項目2の名前" })).toHaveValue("測定項目 2");
    fireEvent.change(screen.getByRole("textbox", { name: "測定項目2の名前" }), {
      target: { value: "蛍光強度" },
    });
    fireEvent.click(screen.getByRole("button", { name: "測定項目2を削除" }));
    expect(screen.queryByRole("textbox", { name: "測定項目2の名前" })).not.toBeInTheDocument();
  });

  it("統計名を選ばずに同じ試料のXとYを入力する設計へ進める", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="general_assay"]')!);
    fireEvent.click(screen.getByRole("button", { name: /2つの測定値の関係/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("heading", { name: "XとYの名前を入力してください" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Xの名前" }), {
      target: { value: "Cell area" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Yの名前" }), {
      target: { value: "Intensity" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("heading", { name: "測定した試料を登録してください" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "試料の数" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "条件間の試料の関係と測定軸を確認します" }),
    ).toBeNull();
  });

  it("測定項目から条件・時間・実験回を順に確認できる", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /その他の培養アッセイ/ }));

    fireEvent.change(screen.getByRole("textbox", { name: "測定項目の名前" }), {
      target: { value: "細胞サイズ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    const conditionTable = screen.getByRole("table");
    expect(within(conditionTable).getByRole("rowheader", { name: "1" })).toBeVisible();
    expect(within(conditionTable).getByRole("rowheader", { name: "5" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "条件の列名" }), {
      target: { value: "Gene" },
    });
    fireEvent.click(screen.getByRole("button", { name: /列を追加/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "列2の列名" }), {
      target: { value: "Sequence" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行10：Gene" }), {
      target: { value: "一時入力" },
    });
    expect(screen.getByRole("textbox", { name: "行11：Gene" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "行10：Gene" }), {
      target: { value: "" },
    });
    fireEvent.paste(screen.getByRole("textbox", { name: "行1：Gene" }), {
      clipboardData: {
        getData: () =>
          "Control\t\nControl\t\nNDEL1\t#1\nNDEL1\t#2\nNDE1\t#1\nNDE1\t#2\nRescue\tWT\nRescue\tMutant",
      },
    });
    expect(screen.getByRole("textbox", { name: "行3：Gene" })).toHaveValue("NDEL1");
    expect(screen.getByRole("textbox", { name: "行4：Gene" })).toHaveValue("NDEL1");
    fireEvent.paste(screen.getByRole("textbox", { name: "行3：Sequence" }), {
      clipboardData: { getData: () => "#1 pasted" },
    });
    expect(screen.getByRole("textbox", { name: "行3：Sequence" })).toHaveValue("#1 pasted");
    const row3Gene = screen.getByRole("textbox", { name: "行3：Gene" });
    row3Gene.focus();
    fireEvent.keyDown(row3Gene, { key: "ArrowDown" });
    expect(screen.getByRole("textbox", { name: "行4：Gene" })).toHaveFocus();
    fireEvent.change(screen.getByRole("textbox", { name: "行3：Gene" }), {
      target: { value: "NDEL1-edited" },
    });
    expect(screen.getByRole("textbox", { name: "行4：Gene" })).toHaveValue("NDEL1");
    fireEvent.change(screen.getByRole("textbox", { name: "行3：Gene" }), {
      target: { value: "NDEL1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(
      screen.getByRole("heading", { name: "条件間の試料の関係と測定軸を確認します" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /条件ごとに別の単位/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別の単位/ }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));
    fireEvent.click(screen.getByRole("radio", { name: /^時間同じ単位/ }));
    expect(screen.getByRole("textbox", { name: "時間点" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "時間点" }), {
      target: { value: "," },
    });
    expect(screen.getByRole("textbox", { name: "時間点" })).toHaveValue(",");
    fireEvent.change(screen.getByRole("textbox", { name: "時間点" }), {
      target: { value: "0, 24, 48" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /同じ単位を各時間点で測った/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("heading", { name: "実験回を登録してください" })).toBeVisible();
    fireEvent.change(screen.getByRole("spinbutton", { name: "実験回数" }), {
      target: { value: "2" },
    });
    expect(screen.getAllByLabelText(/実験日$/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "設計を確認" }));

    expect(screen.getByRole("heading", { name: "この実験の設計を確認" })).toBeVisible();
    expect(document.querySelectorAll(".condition-time-preview__condition")).toHaveLength(8);
    expect(document.querySelector('[data-condition-group="Control"]')).toHaveTextContent(
      "同じ項目 · 2条件",
    );
    expect(document.querySelector('[data-condition-group="NDEL1"]')).toHaveTextContent(
      "同じ項目 · 2条件",
    );
    expect(screen.getByText(/n（実験反復）として混ぜません/)).toBeVisible();
    expect(screen.getByRole("region", { name: "条件と測定軸の配置プレビュー" })).toBeVisible();
    expect(screen.getByText(/実際の測定値や傾向は表示していません/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "予定している解析" })).toBeVisible();
    expect(screen.getByText("同じ単位を時間点間で追った解析候補")).toBeVisible();
    expect(screen.getByText(/実データの欠損や入力構造を確認したあと/)).toBeVisible();
    expect(screen.getByRole("complementary", { name: "保存について" })).toHaveTextContent(
      "デスクトップ版で開くと",
    );
    expect(screen.queryByText(/D0[1-9]/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2. 条件" }));
    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "行3：Sequence" }), {
      target: { value: "#1 corrected" },
    });
    fireEvent.click(screen.getByRole("button", { name: "5. 最終確認" }));
    expect(screen.getByRole("heading", { name: "この実験の設計を確認" })).toBeVisible();
    expect(document.querySelector('[data-condition-group="NDEL1"]')).toHaveTextContent(
      "#1 corrected",
    );

    fireEvent.click(screen.getByRole("button", { name: "この設計で入力を始める" }));
    expect(screen.getByRole("heading", { name: "新しい実験" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeVisible();
  }, 20_000);

  it("ブラウザPhase AでsiRNA×Drug・2時点・別日3実験回を手動作成できる", () => {
    render(<NewExperimentPage browserPreview onNavigate={() => undefined} />);

    expect(document.querySelector('[data-review-entry="phase-a"]')).toBeVisible();
    expect(document.querySelector('[data-review-entry="phase-b"]')).toBeVisible();
    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));

    fireEvent.change(screen.getByRole("textbox", { name: "測定項目の名前" }), {
      target: { value: "Marker X陽性率" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    fireEvent.change(screen.getByRole("textbox", { name: "条件の列名" }), {
      target: { value: "siRNA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /列を追加/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "列2の列名" }), {
      target: { value: "Drug" },
    });
    fireEvent.paste(screen.getByRole("textbox", { name: "行1：siRNA" }), {
      clipboardData: {
        getData: () =>
          "Control\t−\nControl\t+\nGene A #1\t−\nGene A #1\t+\nGene A #2\t−\nGene A #2\t+",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別の単位/ }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));
    fireEvent.click(screen.getByRole("radio", { name: /^時間同じ単位/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "時間点" }), {
      target: { value: "24, 48" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /時間点ごとに別のサンプル/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    const dates = screen.getAllByLabelText(/実験日$/);
    ["2026-08-01", "2026-08-08", "2026-08-15"].forEach((date, index) => {
      fireEvent.change(dates[index]!, { target: { value: date } });
    });
    fireEvent.click(screen.getByRole("button", { name: "設計を確認" }));

    expect(screen.getByText("6条件・2項目")).toBeVisible();
    expect(screen.getByText("Time (h)・2水準（水準ごとに別のサンプル）")).toBeVisible();
    expect(screen.getByText("Exp 1 ／ Exp 2 ／ Exp 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "この設計で入力を始める" }));

    expect(screen.getByText("合成デモデータ", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Exp 1" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getByRole("columnheader", { name: "siRNA" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Drug" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "陽性数" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "対象数" })).toBeVisible();
    expect(screen.getByText(/実験情報（/)).toBeInTheDocument();
  }, 10_000);
});
