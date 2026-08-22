# 統計・作図UIベンチマークと実験者向け方針

更新日: 2026-08-20

## 調査の目的

既存製品の画面をコピーするのではなく、日常の生命科学実験で迷いと往復操作を減らす原則を抽出する。アプリ固有の優先順位は、統計手法の多さよりも、実験デザイン、反復構造、生データ、解析、Figureのつながりを壊さないことである。

## 一次情報から得た原則

- GraphPad Prismは、解析やグラフに合う表形式を先に選び、データ・解析・グラフ・レイアウトを1プロジェクト内で連動させる。表の変更が下流へ反映され、nested tableも用意されている。このアプリでも「どのグラフにするか」だけでなく、統計単位とデータ構造を入口で確定する。ただし、Prismの表分類をそのまま模倣せず、ディッシュ、動物、cell/ROI、siRNA、薬剤など実験者の言葉で質問する。参照: [Prism essential concepts](https://www.graphpad.com/guides/prism/latest/user-guide/how_to_begin.htm)、[data table formats](https://www.graphpad.com/guides/prism/latest/user-guide/using_data_table_format.htm)、[features](https://www.graphpad.com/features)
- jamoviは、データ表と解析結果を近接させ、設定変更に対する結果を見失いにくくしている。また、データ・解析・結果を1ファイルで共有できる。このアプリでは入力、解析、グラフ、保存を短いタブで切り替え、現在位置とcurrent/stale状態を常時見せる。科学的再現性のため、統計解析は無言で再実行せず、変更後に明示的な再実行を求める。参照: [jamovi getting started](https://www.jamovi.org/getting-started.html)、[jamovi](https://www.jamovi.org/index.html)
- Veuszはグラフをオブジェクトとして編集し、SVG/PDF等へ出力する。OriginもProject ExplorerやObject Manager、テンプレートを中心に多数の成果物を管理する。このアプリでは、グラフ設定を長い入力ページへ混在させず、グラフ専用タブのコンパクトな設定領域に集約する。参照: [Veusz](https://veusz.github.io/)、[Veusz GitHub](https://github.com/veusz/veusz)、[Origin GUI](https://docs.originlab.com/tutorials/origin-gui/)
- SuperPlotsOfDataは、個々の観測値と生物学的反復の要約を異なる視覚層で示し、反復を色・形で識別する。D10では薄い小点をcell/ROI、濃い大点を生物学的反復の要約値とし、平均とSDは後者だけから計算する。参照: [SuperPlotsOfData paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8101441/)、[official app](https://huygens.science.uva.nl/SuperPlotsOfData_beta/)
- LabPlotなどのOSSも、データ探索、解析、可視化、再現可能なプロジェクトを一体化している。OSS展開を想定し、内部契約と英語化可能な文言境界を保ちながら、現段階のUIは日本語を優先する。参照: [LabPlot GitHub](https://github.com/KDE/labplot)

## 採用する操作モデル

1. 新しい実験の入口は「実験の操作から始める」を既定とし、「図から探す（補助）」へ同じ場所で切り替える。両方を縦に積まず、図入口も同じ3つの実験分類だけを表示する。
2. 実験設計では、まず「別々の実験単位を群に分けた」「同じ単位を繰り返し測定した」「2項目の関係を見たい」の3つから選ぶ。独立群は同じ入口の中で条件数と1要因／2要因を聞き、D01/D03/D05を内部で選ぶ。解析IDや高度な統計名は入口で選ばせない。
3. データ入力は、要約済み反復値とcell/ROI元データを明示的に分ける。ImageJ Resultsは直接貼り付けられ、各行の所属反復を確認してから適用する。
4. ワークベンチは「データ入力 / 解析 / グラフ / 保存」の短いタブを維持する。各タブに状態を表示し、長い1ページへの集約を避ける。
5. D10グラフはraw observationとreplicate summaryを重ねる。cell/ROIを生物学的nに見せない。
6. グラフの色、点、軸、SD/SEM等はグラフ専用領域で編集する。Figure向け既定値はSD、個別反復点、白背景、十分な文字サイズとする。
7. プロジェクトを開くと、生データ、派生データ、解析、グラフ、Methodsを再編集できる。raw変更時は派生データ以降をstaleにし、上書きしない。
8. 主要本文は18px以上を基本とし、日本語と英語を同じ見出し内で不用意に混在させない。
9. プロジェクト全体の日付は入力の初期値とし、実際の日付はディッシュ・動物・試料などの各実験単位に記録する。日付が同じことだけを理由に対応ありとは判定しない。

## 次のUI改善候補

- プロジェクト内の「データ / 前処理 / 解析 / グラフ / メモ」を示すコンパクトな左レール
- DataとResult/Graphの任意分割表示（狭い画面ではタブへ戻す）
- よく使う実験デザインの保存、複製、最近使ったパターン
- グラフ設定の右側ドロワー化と、変更前後プレビュー
- 条件名、因子名、単位、統計上のnを常時確認できるプロジェクト概要

これらはD01–D05/D10の正確性と保存互換性を崩さない小さな単位で導入する。
