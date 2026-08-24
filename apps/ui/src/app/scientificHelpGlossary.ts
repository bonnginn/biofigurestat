export type ScientificHelpTopicId =
  | "biological-replicate"
  | "technical-replicate"
  | "experimental-unit"
  | "biological-n"
  | "paired"
  | "independent"
  | "nested"
  | "repeated-measures"
  | "longitudinal"
  | "cross-sectional"
  | "sd"
  | "sem"
  | "confidence-interval"
  | "welch-t-test"
  | "student-t-test"
  | "paired-t-test"
  | "mann-whitney"
  | "wilcoxon"
  | "one-way-anova"
  | "welch-anova"
  | "tukey"
  | "dunnett"
  | "games-howell"
  | "holm-correction"
  | "repeated-measures-anova"
  | "sphericity"
  | "auc"
  | "endpoint"
  | "baseline-change"
  | "f-over-f0"
  | "pearson"
  | "spearman"
  | "multiple-comparisons";

export type ScientificHelpTopic = Readonly<{
  id: ScientificHelpTopicId;
  title: string;
  summary: string;
  limitation?: string;
  keywords: readonly string[];
}>;

export const scientificHelpTopics: readonly ScientificHelpTopic[] = [
  {
    id: "biological-replicate",
    title: "生物学的反復",
    summary: "独立に実施・取得された、生物学的な変動を代表する反復です。",
    limitation: "同じ試料から得た複数のcellやfieldは、通常は別の生物学的反復ではありません。",
    keywords: ["biological replicate", "独立実験", "反復"],
  },
  {
    id: "technical-replicate",
    title: "技術的反復",
    summary: "同じ実験単位を繰り返し測定し、測定工程のばらつきを確認する反復です。",
    limitation: "測定回数を増やしても、生物学的nが自動的に増えるわけではありません。",
    keywords: ["technical replicate", "測定反復"],
  },
  {
    id: "experimental-unit",
    title: "実験単位",
    summary: "処置が独立に割り当てられ、推論の独立単位となる最小の対象です。",
    limitation: "cell、field、wellのどれが実験単位かは、実験の割り当て方で決まります。",
    keywords: ["experimental unit", "実験単位"],
  },
  {
    id: "biological-n",
    title: "biological n",
    summary: "解析で独立した生物学的情報として数える実験単位の数です。",
    limitation: "同じ実験単位内の下位観測をnとして重複計数すると、確信度を過大評価します。",
    keywords: ["biological n", "n", "サンプルサイズ"],
  },
  {
    id: "paired",
    title: "対応あり（paired）",
    summary: "同じ実験単位、または事前に対応づけた単位同士を条件間で比較する設計です。",
    limitation: "同じ日に測っただけでは対応ありになりません。安定した対応IDが必要です。",
    keywords: ["paired", "対応あり", "マッチ"],
  },
  {
    id: "independent",
    title: "独立（independent）",
    summary: "各条件の実験単位が互いに重ならず、対応づけられていない設計です。",
    limitation:
      "共通の親試料やbatchがある場合は、完全な独立ではなく階層・block構造かもしれません。",
    keywords: ["independent", "独立", "unpaired"],
  },
  {
    id: "nested",
    title: "入れ子（nested）",
    summary: "cellがdishに属するように、複数の観測が上位の実験単位に属する構造です。",
    limitation: "下位観測をすべて独立nとして扱うと擬似反復になります。",
    keywords: ["nested", "入れ子", "階層", "cell"],
  },
  {
    id: "repeated-measures",
    title: "反復測定",
    summary: "同じ実験単位を複数条件・時点で繰り返し測定する設計です。",
    limitation: "各測定のidentityと欠測の位置を保つ必要があります。",
    keywords: ["repeated measures", "反復測定"],
  },
  {
    id: "longitudinal",
    title: "縦断（longitudinal）",
    summary: "同じ実験単位を時間に沿って追跡し、変化の軌跡を観察します。",
    limitation:
      "時点ごとの値は独立ではないため、identityを無視した解析は適切でないことがあります。",
    keywords: ["longitudinal", "縦断", "time course"],
  },
  {
    id: "cross-sectional",
    title: "横断（cross-sectional）",
    summary: "各時点で異なる実験単位を測定する設計です。",
    limitation: "同じ個体の変化を直接追跡した設計とは解釈できません。",
    keywords: ["cross-sectional", "横断"],
  },
  {
    id: "sd",
    title: "SD（標準偏差）",
    summary: "観測値が平均の周りにどの程度ばらついているかを表します。",
    limitation: "平均推定の精度ではなく、データ自体のばらつきです。",
    keywords: ["SD", "標準偏差"],
  },
  {
    id: "sem",
    title: "SEM（標準誤差）",
    summary: "標本平均の推定精度を表し、一般にSDを√nで割って求めます。",
    limitation: "個々のデータのばらつきを示す指標ではありません。",
    keywords: ["SEM", "標準誤差"],
  },
  {
    id: "confidence-interval",
    title: "信頼区間",
    summary: "効果量などの推定値にどの程度の不確実性があるかを範囲で示します。",
    limitation: "95%信頼区間は、真値が95%の確率でこの区間内にあるという意味ではありません。",
    keywords: ["confidence interval", "CI", "信頼区間"],
  },
  {
    id: "welch-t-test",
    title: "Welchのt検定",
    summary: "独立した2群の平均差を、等分散を仮定せずに評価します。",
    limitation: "実験単位の独立性は別途必要です。",
    keywords: ["Welch", "welch_t"],
  },
  {
    id: "student-t-test",
    title: "Studentのt検定",
    summary: "独立した2群の平均差を、両群の分散が等しいと仮定して評価します。",
    limitation: "等分散の仮定が妥当でないときはWelch法が適します。",
    keywords: ["Student", "student_t"],
  },
  {
    id: "paired-t-test",
    title: "対応のあるt検定",
    summary: "対応づけた各実験単位内の差の平均が0かを評価します。",
    limitation: "対応IDが正しく、差の分布に極端な問題がないことが重要です。",
    keywords: ["paired t", "paired_t", "対応のあるt検定"],
  },
  {
    id: "mann-whitney",
    title: "Mann–Whitney検定",
    summary: "独立2群の値の順位と分布の並び方を比較します。",
    limitation: "追加仮定なしに、単なる中央値差の検定とは解釈できません。",
    keywords: ["Mann–Whitney", "mann_whitney"],
  },
  {
    id: "wilcoxon",
    title: "Wilcoxon符号付順位検定",
    summary: "対応づけた実験単位内の差を、符号と順位に基づいて評価します。",
    limitation: "対応IDを失ったデータには使用できません。",
    keywords: ["Wilcoxon", "wilcoxon_signed_rank"],
  },
  {
    id: "one-way-anova",
    title: "一元配置分散分析",
    summary: "独立した3群以上について、平均がすべて同じかという全体差を評価します。",
    limitation: "どの群間が異なるかには、事前比較または多重比較が別途必要です。",
    keywords: ["one-way ANOVA", "one_way_anova"],
  },
  {
    id: "welch-anova",
    title: "Welchの分散分析",
    summary: "独立した3群以上の平均差を、等分散を仮定せずに評価します。",
    limitation: "群間比較を行う場合はGames–Howellなどの適切な補正が必要です。",
    keywords: ["Welch ANOVA", "welch_anova"],
  },
  {
    id: "tukey",
    title: "Tukey法",
    summary: "すべての群ペアを比較しながら、家族内の第1種過誤を調整します。",
    limitation: "通常のANOVAと同様の分散仮定を伴います。",
    keywords: ["Tukey"],
  },
  {
    id: "dunnett",
    title: "Dunnett法",
    summary: "複数の処置群を1つの対照群と比較するための多重比較法です。",
    limitation: "処置群同士の全ペア比較を目的とする方法ではありません。",
    keywords: ["Dunnett"],
  },
  {
    id: "games-howell",
    title: "Games–Howell法",
    summary: "等分散を仮定せずに、複数群のペアごとの平均差を調整して比較します。",
    limitation: "実験単位が独立していることは引き続き必要です。",
    keywords: ["Games–Howell", "games_howell"],
  },
  {
    id: "holm-correction",
    title: "Holm補正",
    summary: "複数のp値を順に調整し、全体の偽陽性リスクを抑えます。",
    limitation: "比較数が増えるほど、差を検出する力は低下しやすくなります。",
    keywords: ["Holm", "multiple comparisons"],
  },
  {
    id: "repeated-measures-anova",
    title: "反復測定分散分析",
    summary: "同じ実験単位を複数条件で測った平均差を、単位内の対応を保って評価します。",
    limitation: "条件数が3以上では球面性などの仮定に注意が必要です。",
    keywords: ["repeated-measures ANOVA", "repeated_measures_anova"],
  },
  {
    id: "sphericity",
    title: "球面性",
    summary: "反復測定条件どうしの差の分散が同程度であるという仮定です。",
    limitation: "違反を無視するとp値が楽観的になるため、補正や別モデルが必要な場合があります。",
    keywords: ["sphericity", "球面性"],
  },
  {
    id: "auc",
    title: "AUC",
    summary: "曲線下面積として、一定区間の応答を1つの値に要約します。",
    limitation: "同じAUCでも軌跡の形は異なり得るため、時間変化の詳細は失われます。",
    keywords: ["AUC", "曲線下面積"],
  },
  {
    id: "endpoint",
    title: "endpoint",
    summary: "事前に定めた最終または特定時点の値だけを比較します。",
    limitation: "途中の軌跡や一過性の変化は評価しません。",
    keywords: ["endpoint", "最終時点"],
  },
  {
    id: "baseline-change",
    title: "baselineからの変化量",
    summary: "各実験単位について、基準時点からの増減を求めて比較します。",
    limitation: "baselineの測定誤差も変化量に含まれます。",
    keywords: ["baseline change", "baselineからの変化"],
  },
  {
    id: "f-over-f0",
    title: "F/F0",
    summary: "各測定値を基準蛍光F0で割り、baselineに対する相対変化として表します。",
    limitation: "F0が不安定または0に近い場合、比率が不安定になります。",
    keywords: ["F/F0", "蛍光"],
  },
  {
    id: "pearson",
    title: "Pearson相関",
    summary: "2つの連続変数の線形な関連の強さと向きを評価します。",
    limitation: "非線形な関連や強い外れ値には敏感です。相関は因果関係を示しません。",
    keywords: ["Pearson", "pearson"],
  },
  {
    id: "spearman",
    title: "Spearman順位相関",
    summary: "順位に基づき、2変数の単調な関連の強さと向きを評価します。",
    limitation: "相関は因果関係を示さず、同順位が多い場合は情報が減ります。",
    keywords: ["Spearman", "spearman"],
  },
  {
    id: "multiple-comparisons",
    title: "多重比較",
    summary: "複数の仮説を同時に調べると増える偽陽性リスクを、補正して管理します。",
    limitation:
      "補正法は比較の目的に合わせて選び、未計画の比較を無制限に増やさないことが重要です。",
    keywords: ["multiple comparisons", "多重比較", "multiplicity"],
  },
] as const;

const topicById = new Map(scientificHelpTopics.map((topic) => [topic.id, topic]));

export function scientificHelpTopic(id: ScientificHelpTopicId): ScientificHelpTopic {
  const topic = topicById.get(id);
  if (!topic) throw new Error(`Unknown scientific Help topic: ${id}`);
  return topic;
}

const METHOD_TOPICS: Readonly<Record<string, ScientificHelpTopicId>> = {
  welch_t: "welch-t-test",
  student_t: "student-t-test",
  paired_t: "paired-t-test",
  mann_whitney: "mann-whitney",
  wilcoxon_signed_rank: "wilcoxon",
  one_way_anova: "one-way-anova",
  welch_anova: "welch-anova",
  repeated_measures_anova: "repeated-measures-anova",
  pearson: "pearson",
  spearman: "spearman",
};

export function helpTopicForMethod(method: string | null | undefined) {
  return method ? METHOD_TOPICS[method] : undefined;
}
