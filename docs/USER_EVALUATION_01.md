# User Evaluation 01: first self-use vertical slice

## Purpose

Confirm that both the graph-pattern and experiment-language entrances are understandable for D01/D02/D03. This review is about scientific intent, usability, and publication-oriented graph readability, not Windows deployment.

## Recommended first scenario

Use a small synthetic positive-cell dataset; do not use unpublished data for the first review.

1. Launch `Life Science Analysis.app`.
2. Choose **New experiment**, then select the synthetic **別々の2群を比べる** graph pattern and **顕微鏡**.
3. Keep **separate dishes / independent units** for an ordinary control-versus-treatment RPE1 experiment.
4. Confirm the design and choose **陽性細胞率 (%)**.
5. Enter positive and total counts for three biological replicates per condition.
6. Confirm that the percentage is derived and that cells are not described as biological `n`.
7. In **1 データ入力**, choose **検証して続ける**.
8. In **2 解析**, inspect the recommendation and run the recommended analysis.
9. In **3 グラフ**, inspect the individual replicate points and SD error bars, try an appearance preset, and export SVG/CSV; in **4 保存**, enter the project metadata and save a `.lsa` project package.
10. Return to Home → Open project, select the saved `.lsa` directory, confirm that the positive/total observations and graph are restored in an editable state, change one value, and save it back to the same project.

## ImageJ paste check

For microscopy intensity, copy an ImageJ Results table or a small synthetic equivalent such as `Area` and `Mean` columns. Paste it into the scalar bulk-entry area, confirm that `Mean` is recommended, choose the destination condition, and apply it. This first importer expects one summarized value per biological replicate. Do not paste individual cells or fields from one dish as if each row were an independent biological replicate.

## WB source-value check

Start a two-condition WB experiment and choose **WB生バンド（標的／ローディングコントロール）**. Enter one target and one loading-control intensity for each biological replicate. Confirm that the displayed ratio updates, D01/D02 analyzes the ratio without counting bands as `n`, Methods states the division formula, and a saved/reopened project restores both source values for editing. The separate **正規化WB強度** choice remains available when normalization was already completed elsewhere.

## One pairing check

Start a second temporary Microscopy experiment and choose **same biological unit measured in both conditions**. Confirm that the wording makes it clear why this routes to D02 and that the paired graph connects the same units. Ordinary same-day cells in separate dishes should remain D01 unless an explicit run/block design is chosen.

## One multi-group check

Choose the synthetic **別々の3群以上を比べる** pattern, set three conditions and three biological replicates per condition, and complete the workflow. Confirm that D03 reports Welch ANOVA first and Games–Howell adjusted pairwise comparisons second, and that all condition labels remain readable in the graph and saved project.

## One grouped factorial check

Choose the synthetic **siRNA種類 × 薬剤 −/+** pattern. Confirm that Control and siRNA #1/#2/#3 create eight explicit condition cells across drug −/+, while the three sequences are never described as biological `n`. After analysis, confirm that the graph clusters drug −/+ within each intervention level, colors the drug series consistently, and shows separate Control-group and Target-group brackets. Save, reopen, and confirm that the eight editable cells and the scientific parent groups are retained.

## Repeated and factorial checks

- Choose **同じ単位を3条件以上で比べる** and confirm that one matched-unit ID runs across every condition, incomplete units are not silently dropped, and the graph connects the same unit across conditions.
- Choose **2つの要因を組み合わせる**, name two factors and their two levels, and confirm that the four factorial cells are created automatically. The result should show the interaction first, the two main effects second, and Holm-adjusted cell comparisons last.
- Confirm that merely using the same cell line or experiment date does not turn the D05 cells into repeated measurements.

## Feedback requested

- Any question whose experimental wording is unclear.
- Any place where the app appears to count cells, fields, wells, or technical replicates as biological `n`.
- Whether the D01 versus D02 explanation matches how the experiment was actually performed.
- Whether the saved/reopened view retains enough information to trust the analysis.
- Whether choosing a graph pattern feels faster without making the experimental-unit questions feel redundant.
- The first additional graph setting that feels essential before daily use.

Windows installation, export fidelity, and advanced analyses remain later milestones. Typography, Japanese wording, tab navigation, and graph readability are now part of this review.
