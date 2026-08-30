# Internal Alpha用 合成データ

すべて架空の値です。実測・未発表データは含みません。列名は説明用なので、コードブロック内の数値だけをコピーしてください。

## A. 独立3群・連続値

最短経路は「新しい実験」→「合成デモデータですぐ試す」→「Simple 3群（連続値）」です。手入力経路を確認する場合は、各Expタブで該当条件の「生データを入力」を開き、次の1値を貼り付けます。

| 実験回 | Control | Treatment A | Treatment B |
| ------ | ------: | ----------: | ----------: |
| Exp 1  |      10 |          15 |          22 |
| Exp 2  |      12 |          17 |          25 |
| Exp 3  |      11 |          16 |          24 |

Exp 1:

```text
10
15
22
```

Exp 2:

```text
12
17
25
```

Exp 3:

```text
11
16
24
```

## B. 同じ個体の2条件

「同じ個体の2条件比較」合成デモと同じ決定値です。各Animalタブの条件はBefore、Afterの順です。割合表へ貼る場合は、左上の「陽性数」セルから2列（陽性数、対象数）を貼り付けます。

Animal 1:

```text
28	100
42	100
```

Animal 2:

```text
34	100
39	100
```

Animal 3:

```text
31	100
49	100
```

Animal 4:

```text
37	100
45	100
```

## C. 同じ単位の経時追跡

最短経路は「同一Cellの経時追跡」合成デモです。各Cellが安定した1単位で、ControlとStimulatedを0、6、12、24 hで保持します。手入力確認では各セルの「生データを入力」を開き、表の値を1値ずつ貼り付けます。

| Unit   | Condition  |  0 h |  6 h | 12 h | 24 h |
| ------ | ---------- | ---: | ---: | ---: | ---: |
| Cell 1 | Control    | 30.0 | 31.0 | 32.0 | 33.0 |
| Cell 1 | Stimulated | 33.0 | 36.2 | 39.4 | 42.6 |
| Cell 2 | Control    | 31.5 | 32.5 | 33.5 | 34.5 |
| Cell 2 | Stimulated | 34.5 | 37.7 | 40.9 | 44.1 |
| Cell 3 | Control    | 33.0 | 34.0 | 35.0 | 36.0 |
| Cell 3 | Stimulated | 36.0 | 39.2 | 42.4 | 45.6 |
| Cell 4 | Control    | 34.5 | 35.5 | 36.5 | 37.5 |
| Cell 4 | Stimulated | 37.5 | 40.7 | 43.9 | 47.1 |

## D. 複数測定項目

「複数の測定項目」合成デモを使用します。Marker X陽性率は約25–44%、蛍光強度は約20–32 a.u.で、取り違えを目視しやすくしてあります。

割合（各ExpでControl、Treatmentの順。陽性数、対象数）:

```text
25	100
40	100
```

蛍光強度は各条件に8–10個の生データが事前入力されています。Graph作成時に測定項目を明示的に選択してください。

## E. 派生時間指標

Cの「同一Cellの経時追跡」を再利用します。Graph作成時に「各単位から求めた派生値」→「AUC（台形法）」を選び、windowを0–24 hにします。値を別途作る必要はありません。

## F. Western blot

「WB target/reference」合成デモを使うのが最短です。手入力経路では各Expタブの最初のTargetセルを選び、次の2列（Target、GAPDH）×2行（Control、Treatment）を貼り付けます。

Exp 1:

```text
100	50
140	52
```

Exp 2:

```text
108	54
151	53
```

Exp 3:

```text
96	48
172	51
```

確認する生値は上記のままで、比はアプリが派生します。実験内正規化は明示的に選ばない限りOFFのままにします。

## G. 陽性数・割合（Stage 1–6 native確認）

「細胞・培養」→「陽性数・割合」でControl、Treatment A、Treatment Bの3条件、Exp 1–3を作ります。各Expタブの左上の陽性数セルから2列を貼り付けます。

Exp 1:

```text
20	100
35	100
50	100
```

Exp 2:

```text
22	100
36	100
52	100
```

Exp 3:

```text
18	100
33	100
49	100
```

条件表でControl行を「対照」に明示指定します。名前からの自動推測ではなく、保存後も同じ条件IDが対照として残ることを確認します。

## H. 顕微鏡強度・Cell/ROI入れ子（Stage 1–6 native確認）

「顕微鏡・画像解析」→「蛍光強度」→「各実験単位内のCell・ROI値を複数」でControl、Treatmentの2条件、Exp 1–3を作ります。各セルの生データ入力欄へ1列ずつ貼り付けます。

| 実験回 | Control       | Treatment     |
| ------ | ------------- | ------------- |
| Exp 1  | `10 11 12 13` | `15 16 17 18` |
| Exp 2  | `9 10 11 12`  | `14 15 16 17` |
| Exp 3  | `11 12 13 14` | `16 17 18 19` |

貼り付け用：

```text
10
11
12
13
```

統計上のnはCell/ROIの総数ではなく、各条件Exp 1–3の3です。

## I. WB背景補正6列（Stage 1–6 native確認）

「タンパク質・生化学」→「Western blot」→「Target + reference」→「ImageJのIntensity・Background・Areaから計算」を選びます。各Expタブの左上から、Target 3列とreference 3列を矩形貼り付けします。

列順：`Target intensity / Target background / Target area / Reference intensity / Reference background / Reference area`

Exp 1:

```text
100	10	20	60	10	20
130	10	20	60	10	20
```

Exp 2:

```text
105	10	20	62	10	20
142	10	20	62	10	20
```

Exp 3:

```text
95	10	20	58	10	20
128	10	20	58	10	20
```

アプリは各bandについて`(Mean intensity - Mean background) × Area`を計算し、そのTarget/reference比を派生します。6つのsource値、補正値、比を別段階として保存し、RawIntDenと同義には扱いません。
