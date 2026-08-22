# ADR 0038: Control-vs-many package decision

Status: Superseded in part by ADR 0041; Tier A execution accepted

## Environment finding

Pin済みengineはPython 3.12、NumPy 2.3.5、SciPy 1.18.0、validation用Statsmodels 0.14.6である。SciPy 1.18.0は保守された`scipy.stats.dunnett` APIを提供する。

API：

```text
dunnett(*samples, control, alternative='two-sided', rng=...)
```

戻り値は対照群対各群のstatistic、family-wise errorを調整したp-value、simultaneous confidence intervalを含む。

## Statistical boundary

SciPyのDunnettは独立観測、正規性、共通の群内分散を前提とする古典的single-step Dunnettである。現行の分散頑健な既定経路`Welch ANOVA + Games–Howell all-pairs`と同じものではない。

- Welchの後に標準Dunnettを黙って実行しない。
- 既定のWelch + Games–Howellを維持する。
- Control-vs-manyは`classical one-way ANOVA + Dunnett`の明示的な実行経路として別contractにする。
- Controlはstable condition IDで宣言し、labelから推測しない。
- sidednessは`two-sided`/`less`/`greater`の実行値を保存する。
- 生成器を固定seedし、再現可能な数値を保証する。

## Gate

ADR 0041のTier A方針により、固定SciPy public API、安定control ID、明示的な
control-vs-many intent、固定RNG、数値回帰・エッジケース・Methods検証が通れば
Internal Alphaで実行可能とする。独立実装の追加検証は有用だが、公開の必須条件ではない。

## 2026-08-22 implementation note

- 既存の分散頑健な`Welch ANOVA + Games–Howell all-pairs`は継続して公開する。
- Games–Howellについてはproduction SciPyとは別のvalidation-only Statsmodels studentized-range実装で、adjusted p-valueと95% simultaneous CIを照合した。
- 3条件以上の設計では、研究者が対照条件を任意に明示できる。stable condition IDをproject、D03 request、Methodsへ保存し、表示名から推測しない。
- この対照指定は結果内のcontrol comparisonsを識別するmetadataであり、現行の全ペア補正をDunnettへ変換しない。
- 古典的ANOVA + Dunnettは、Tier Aの決定論的回帰、stable control ID、missing-control、
  adjusted p-value、two-sided contractの検証を通してUI公開した。one-sided inferenceは
  現行の有限区間result contractでは公開せず、request/engineの両境界で明示的に拒否する。
