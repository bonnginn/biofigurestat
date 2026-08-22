# ADR 0036: Statistics workspace boundary

Status: accepted

## Decision

Project主navigationで`Data | Graph | Statistics`を独立させる。保存はproject操作として維持する。

- Dataはraw、派生値、unit structure、QCを扱う。
- Graphはgraph specとappearanceを扱う。
- Statisticsはanalysis request、contrast、result、warning、engine metadata、Methodsを扱う。
- Graphの統計注釈は保存済みanalysis run IDとtest/contrast IDを参照する。

Graph appearanceの変更はanalysis fingerprintに含めない。Data、design、unit identity、subset、transformationの変更は関連analysisとannotationをstaleにする。

## UI contract

Statisticsは選択中のreadout/dataset、conditions、time/window、statistical unit、design interpretation、recommendation、実行可能なalternative、result、multiplicity、effect/CI、engine、Methods、stale stateを段階表示する。一枚の巨大formにしない。

## Migration

現在Graph内に保存されるanalysis stateは、既存のanalysis request/result/historyを正本としてStatisticsに表示する。Graph-specificのコピーを新たな統計正本にしない。
