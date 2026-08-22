# ADR 0040: Lineage-preserving WB background correction

Status: accepted

## Input modes

WB readoutは次のmodeを明示的に持つ。旧projectは`corrected_value_direct`へ移行し、意味を変えない。

1. `corrected_value`：補正済みband valueを直接入力
2. `imagej_mean_background_area`：Mean intensity、Mean background、Areaをraw入力し、選択済みformulaで補正値を派生

## Transformation

初期対応formulaはversion付きで次を表現する。

```text
corrected = (intensity - background) * area
```

ただし、IntensityとBackgroundが単位面積あたりの値であると明示的に選択した場合だけ適用する。Mean gray value、Integrated density、RawIntDenを自動的に同義としない。

## Lineage

```text
source measurement
  -> background correction specification/version
  -> corrected Target and reference values
  -> Target/reference ratio
  -> optional within-experiment normalization
```

各stageはsource observation/revision IDを参照し、元の値を上書きしない。上流の変更で下流derived dataset、analysis、annotation、Methodsをstale化する。

実装では`loading_control_ratio` measurementに、補正後Target/referenceと任意の`sourceMeasurements`を同時に保持する。`sourceMeasurements`はmethod/versionとTarget/reference各々のIntensity、Background、Areaを持つ。canonical recovery CSVにもこれらを別列で出力する。旧measurementにはこのoptional fieldがないため、その意味は補正済み直接入力のまま変化しない。

## UI

補正modeとformulaは入力開始前に明示し、既定で黙ってONにしない。ImageJの値の種類と式が適用できる条件をcontextual helpに表示する。
