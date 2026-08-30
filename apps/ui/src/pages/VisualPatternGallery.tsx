import { useState } from "react";

/**
 * Internal hand-off values for the experiment wizard. These IDs are kept out
 * of the user-facing gallery so that the gallery describes what was done in
 * the lab rather than asking the researcher to know an analysis template.
 */
export type VisualPatternPreset = {
  templateId: "D01" | "D02" | "D03" | "D04" | "D05" | "D09";
  plannedN: number;
  conditionCount: number;
  factorialPreset?: "sirna-drug";
  multiGroupPreset?: "sirna-series";
};

type Purpose = "western_blot" | "microscopy";

type VisualPatternGalleryProps = {
  onSelect: (purpose: Purpose, preset: VisualPatternPreset) => void;
};

function DotPlotPreview() {
  const values = [
    [78, 70, 63],
    [52, 45, 38],
  ];
  const xPositions = [82, 184];
  return (
    <svg viewBox="0 0 260 150" role="img" aria-label="別々の実験単位を条件ごとに比べる模式図">
      <line className="pattern-axis" x1="28" y1="15" x2="28" y2="116" />
      <line className="pattern-axis" x1="28" y1="116" x2="244" y2="116" />
      {values.map((group, groupIndex) => {
        const x = xPositions[groupIndex];
        const mean = group.reduce((sum, value) => sum + value, 0) / group.length;
        return (
          <g key={x}>
            {group.map((value, pointIndex) => (
              <circle
                className={`pattern-dot pattern-dot--${groupIndex + 1}`}
                key={`${x}-${value}`}
                cx={x + (pointIndex - 1) * 10}
                cy={116 - value}
                r="4.5"
              />
            ))}
            <line
              className="pattern-mean"
              x1={x - 19}
              y1={116 - mean}
              x2={x + 19}
              y2={116 - mean}
            />
          </g>
        );
      })}
      <text className="pattern-label" x="82" y="137" textAnchor="middle">
        条件A
      </text>
      <text className="pattern-label" x="184" y="137" textAnchor="middle">
        条件B
      </text>
      <text
        className="pattern-y-label"
        x="8"
        y="66"
        textAnchor="middle"
        transform="rotate(-90 8 66)"
      >
        測定値
      </text>
    </svg>
  );
}

function RepeatedPreview() {
  const units = [
    [80, 63, 46],
    [70, 58, 38],
    [60, 49, 31],
  ];
  const x = [58, 136, 214];
  return (
    <svg viewBox="0 0 260 150" role="img" aria-label="同じ実験単位を複数条件で測る模式図">
      <line className="pattern-axis" x1="28" y1="15" x2="28" y2="116" />
      <line className="pattern-axis" x1="28" y1="116" x2="244" y2="116" />
      {units.map((values, unitIndex) => (
        <g key={values.join("-")}>
          <polyline
            className="pattern-pair-line"
            points={values.map((value, index) => `${x[index]},${116 - value}`).join(" ")}
          />
          {values.map((value, conditionIndex) => (
            <circle
              className={`pattern-dot pattern-dot--${conditionIndex + 1}`}
              key={`${unitIndex}-${conditionIndex}`}
              cx={x[conditionIndex]}
              cy={116 - value}
              r="4.5"
            />
          ))}
        </g>
      ))}
      {x.map((position, index) => (
        <text className="pattern-label" key={position} x={position} y="137" textAnchor="middle">
          {`条件${String.fromCharCode(65 + index)}`}
        </text>
      ))}
    </svg>
  );
}

function CorrelationPreview() {
  const points = [
    [52, 94],
    [83, 78],
    [113, 82],
    [144, 58],
    [176, 49],
    [211, 36],
  ];
  return (
    <svg viewBox="0 0 260 150" role="img" aria-label="同じ実験単位の2つの測定値の関係を示す模式図">
      <line className="pattern-axis" x1="28" y1="15" x2="28" y2="116" />
      <line className="pattern-axis" x1="28" y1="116" x2="244" y2="116" />
      <line className="pattern-correlation-line" x1="43" y1="101" x2="221" y2="29" />
      {points.map(([x, y], index) => (
        <circle
          className="pattern-dot pattern-dot--1"
          key={`${x}-${y}-${index}`}
          cx={x}
          cy={y}
          r="4.5"
        />
      ))}
      <text className="pattern-label" x="136" y="137" textAnchor="middle">
        測定値X
      </text>
      <text
        className="pattern-y-label"
        x="8"
        y="66"
        textAnchor="middle"
        transform="rotate(-90 8 66)"
      >
        測定値Y
      </text>
    </svg>
  );
}

const PATTERN_PRESETS: ReadonlyArray<{
  id: "independent-groups" | "repeated-units" | "measurement-relationship";
  title: string;
  description: string;
  note: string;
  preset: VisualPatternPreset;
  preview: "independent" | "repeated" | "correlation";
}> = [
  {
    id: "independent-groups",
    title: "別々の実験単位を群に分けた",
    description: "別のディッシュ、動物、試料などを、対照や処理などの条件へ割り当てた実験。",
    note: "条件数や処置の組み合わせは次の画面で確認します。",
    preset: { templateId: "D01", plannedN: 3, conditionCount: 2 },
    preview: "independent",
  },
  {
    id: "repeated-units",
    title: "同じ単位を複数条件で測定した",
    description: "同じ動物、ドナー、試料などを、前後や複数の条件で繰り返し測定した実験。",
    note: "同じ日に別々のディッシュを扱った場合は、次の画面で単位を確認します。",
    preset: { templateId: "D02", plannedN: 3, conditionCount: 2 },
    preview: "repeated",
  },
  {
    id: "measurement-relationship",
    title: "同じ単位のXとYの関係を見たい",
    description: "各サンプルから2つの測定値を取り、値どうしの関係を見たい実験。",
    note: "XとYの名前や、どのような関係を知りたいかは次の画面で確認します。",
    preset: { templateId: "D09", plannedN: 5, conditionCount: 2 },
    preview: "correlation",
  },
];

function PatternPreview({ kind }: { kind: (typeof PATTERN_PRESETS)[number]["preview"] }) {
  if (kind === "independent") return <DotPlotPreview />;
  if (kind === "repeated") return <RepeatedPreview />;
  return <CorrelationPreview />;
}

export function VisualPatternGallery({ onSelect }: VisualPatternGalleryProps) {
  const [purpose, setPurpose] = useState<Purpose>("microscopy");

  return (
    <section className="pattern-gallery" aria-labelledby="pattern-gallery-heading">
      <div className="section-heading-row pattern-gallery-heading">
        <div>
          <p className="overline">図から探す（補助）</p>
          <h2 id="pattern-gallery-heading">図のイメージから始める</h2>
          <p>
            近い形を選ぶだけで、次の画面に実験の質問を引き継ぎます。解析名や条件数をここで選ぶ必要はありません。
          </p>
        </div>
        <fieldset className="pattern-purpose-switch">
          <legend>測定方法</legend>
          <label>
            <input
              type="radio"
              name="gallery-purpose"
              checked={purpose === "microscopy"}
              onChange={() => setPurpose("microscopy")}
            />
            顕微鏡
          </label>
          <label>
            <input
              type="radio"
              name="gallery-purpose"
              checked={purpose === "western_blot"}
              onChange={() => setPurpose("western_blot")}
            />
            ウェスタンブロット（WB）
          </label>
        </fieldset>
      </div>

      <div className="pattern-card-grid">
        {PATTERN_PRESETS.map(({ id, title, description, note, preset, preview }) => (
          <article className="pattern-card" data-pattern={id} key={id}>
            <div className="pattern-card-preview">
              <PatternPreview kind={preview} />
            </div>
            <div className="pattern-card-copy">
              <h3>{title}</h3>
              <p>{description}</p>
              <p className="pattern-card-note">{note}</p>
            </div>
            <button
              className="primary-button primary-button--ready pattern-start-button"
              type="button"
              onClick={() => onSelect(purpose, preset)}
            >
              この実験から始める
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
