import type { ComponentProps } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import { ExperimentGraphXAxisEditor } from "./ExperimentGraphXAxisEditor";
import { ExperimentGraphYAxisEditor } from "./ExperimentGraphYAxisEditor";

type Props = Readonly<{
  target: "x-axis" | "y-axis";
  xAxis: ComponentProps<typeof ExperimentGraphXAxisEditor>;
  yAxis: ComponentProps<typeof ExperimentGraphYAxisEditor>;
}>;

/** Axis-inspector composition only; axis and appearance state remain owned by the workspace. */
export function ExperimentGraphAxisInspector({ target, xAxis, yAxis }: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const isYAxis = target === "y-axis";

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{isYAxis ? t("Y軸", "Y axis") : t("X軸", "X axis")}</h3>
      {isYAxis ? <ExperimentGraphYAxisEditor {...yAxis} /> : <ExperimentGraphXAxisEditor {...xAxis} />}
    </section>
  );
}
