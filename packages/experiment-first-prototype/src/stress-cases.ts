import type { GoldCase } from "./gold-types.ts";

type StressCase = Omit<GoldCase, "source" | "architecture_a_current"> & {
  architecture_a_current?: GoldCase["architecture_a_current"];
};

const finalize = (item: StressCase): GoldCase => ({
  ...item,
  source: "stress_expansion_non_pool_d",
  architecture_a_current: item.architecture_a_current ?? {
    correct_structure_reachable: "partial",
    input_load: "high",
  },
});

export const STRESS_CASES: GoldCase[] = [
  finalize({
    case_id: "EFS-046",
    domain: "cell_biology",
    title: "感染効率差による不均衡な独立培養",
    experiment_description:
      "独立に立ち上げた18個の初代気道上皮培養をmockまたはウイルス感染へ割り付けた。汚染でmock 1培養、感染3培養を廃棄し、残った各培養から24時間後の上清を1本ずつ回収してIFN-β濃度を測定した。廃棄培養を別培養の値で補わず、培養間で上清を混合しなかった。",
    true_experimental_unit: "independent culture",
    identities: ["CultureID"],
    factors_conditions: [
      { name: "Infection", levels: ["Mock", "Virus"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent_unequal_n",
    repeated_structure: "none",
    nested_structure: [],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one retained independent culture",
      column_semantics:
        "CultureID, Infection, IFN-beta, missingness if a planned culture is retained as a record",
    },
    expected_internal_design: { measurements: [{ name: "IFN-beta", value_type: "continuous" }] },
  }),
  finalize({
    case_id: "EFS-047",
    domain: "animal_longitudinal",
    title: "不規則採血日の個体別薬物濃度",
    experiment_description:
      "ビーグル犬14頭へ同じ用量を1回投与し、個体ごとに投与前、投与後1、3、7、14日を予定した。静脈確保不良や休日変更により実採血時刻は犬ごとにずれ、採れなかった時点もある。各血漿試料にはDogIDと投与後実時間を記録し、同じ犬を追跡して薬物濃度を測定した。",
    true_experimental_unit: "dog",
    identities: ["DogID"],
    factors_conditions: [],
    condition_relationship: "none",
    repeated_structure: "same dog at irregular elapsed times",
    nested_structure: [],
    ordered_axes: [
      {
        name: "ElapsedTime",
        unit: "hour",
        levels: [0, 24, 72, 168, 336],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "repeated_axis_matrix",
      row_semantics: "one dog with long-form rows accepted for actual times",
      column_semantics: "DogID, actual ElapsedTime, concentration, missingness",
    },
    expected_internal_design: {
      measurements: [
        { name: "drug concentration", value_type: "continuous", axis_names: ["ElapsedTime"] },
      ],
    },
  }),
  finalize({
    case_id: "EFS-048",
    domain: "organoid_microscopy",
    title: "オルガノイド内細胞の反復追跡",
    experiment_description:
      "6ドナーから各4個の腸管オルガノイドを作り、オルガノイド単位でvehicleまたは阻害剤へ割り付けた。各オルガノイド内で開始時に8〜20個の細胞へ追跡番号を付け、0、2、6、12時間に同じ細胞の核移行比を撮像した。分裂や視野外移動で後半の値が欠ける細胞があるが、別細胞へIDを付け替えなかった。",
    true_experimental_unit: "organoid",
    identities: ["OrganoidID", "CellTrackID", "DonorID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Vehicle", "Inhibitor"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent_blocked_by_donor",
    repeated_structure: "same tracked cell across time within organoid",
    nested_structure: [
      { level: "donor", parent: null, role: "block" },
      { level: "organoid", parent: "donor", role: "experimental_unit" },
      { level: "tracked cell", parent: "organoid", role: "subsample" },
    ],
    ordered_axes: [
      {
        name: "Hour",
        unit: "hour",
        levels: [0, 2, 6, 12],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "nested_observation_table",
      row_semantics: "one tracked-cell observation at one time",
      column_semantics: "DonorID, OrganoidID, CellTrackID, Treatment, Hour, ratio, missingness",
    },
    expected_internal_design: {
      measurements: [
        {
          name: "nuclear translocation ratio",
          value_type: "continuous",
          observation_level: "tracked cell",
          axis_names: ["Hour"],
        },
      ],
    },
  }),
  finalize({
    case_id: "EFS-049",
    domain: "animal_immunology",
    title: "同一血漿からの複数炎症readout",
    experiment_description:
      "32匹のマウスをvehicleまたは炎症刺激へ個体単位で割り付け、6時間後に各個体から血漿を1検体採取した。同じ血漿アリコートからIL-6、TNF-α、CXCL1を測定し、3値すべてに同じMouseIDを保持した。一部のCXCL1だけが検出限界外で、他の測定値は残した。",
    true_experimental_unit: "mouse",
    identities: ["MouseID"],
    factors_conditions: [
      { name: "Challenge", levels: ["Vehicle", "InflammatoryStimulus"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "multiple readouts from same terminal sample",
    nested_structure: [],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one mouse sample",
      column_semantics: "MouseID, Challenge, IL-6, TNF-alpha, CXCL1, per-readout missingness",
    },
    expected_internal_design: {
      measurements: [
        { name: "IL-6", value_type: "continuous" },
        { name: "TNF-alpha", value_type: "continuous" },
        { name: "CXCL1", value_type: "continuous" },
      ],
    },
  }),
  finalize({
    case_id: "EFS-050",
    domain: "biochemistry",
    title: "膜ごとのloading controlを保持したWestern blot",
    experiment_description:
      "独立に培養した12ディッシュをcontrolまたは薬剤へ割り付け、各ディッシュから1 lysateを作製した。各lysateを1レーンにロードし、リン酸化ERKとtotal ERKを同じ膜から定量した。背景補正後の両intensityをlane ID付きで保存し、比だけに事前集約しなかった。",
    true_experimental_unit: "culture dish",
    identities: ["DishID", "LaneID", "MembraneID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Control", "Drug"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "target and reference measured from same lane",
    nested_structure: [
      { level: "membrane", parent: null, role: "block" },
      { level: "culture dish", parent: "membrane", role: "experimental_unit" },
      { level: "lane", parent: "culture dish", role: "sample" },
    ],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "typed_record_table",
      row_semantics: "one lane with linked target and reference components",
      column_semantics:
        "MembraneID, DishID, LaneID, Treatment, phospho-ERK intensity, total-ERK intensity",
    },
    expected_internal_design: {
      measurements: [
        {
          name: "ERK phosphorylation",
          value_type: "western_blot_target_reference",
          observation_level: "lane",
        },
      ],
    },
  }),
  finalize({
    case_id: "EFS-051",
    domain: "clinical_physiology",
    title: "washout付き二期crossoverと脱落",
    experiment_description:
      "18名が飲料Aと飲料Bを1週間のwashoutを挟んで異なる順序で摂取し、各期の2時間後血糖を測定した。同じParticipantIDで二期を結び付けたが、2名は第2期前に脱落し第1期の値だけが残った。PeriodとSequenceを記録し、欠けた第2期を他人の値で補わなかった。",
    true_experimental_unit: "participant",
    identities: ["ParticipantID"],
    factors_conditions: [
      { name: "Drink", levels: ["A", "B"], unit_role: "within_unit" },
      { name: "Period", levels: ["1", "2"], unit_role: "within_unit" },
    ],
    condition_relationship: "crossover_incomplete",
    repeated_structure: "same participant across periods when retained",
    nested_structure: [],
    ordered_axes: [
      {
        name: "Period",
        unit: "period",
        levels: [1, 2],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one participant-period record",
      column_semantics: "ParticipantID, Sequence, Period, Drink, glucose, dropout reason",
    },
    expected_internal_design: {
      measurements: [
        { name: "two-hour glucose", value_type: "continuous", axis_names: ["Period"] },
      ],
    },
  }),
  finalize({
    case_id: "EFS-052",
    domain: "organoid",
    title: "ドナー内オルガノイドのdoseと同一unit刺激切替",
    experiment_description:
      "8ドナーから複数の肝オルガノイドを作り、各ドナー内でオルガノイドを低用量または高用量へ割り付けた。各オルガノイドについて刺激前と刺激30分後に同じ培養を壊さず発光を読んだ。DonorIDとOrganoidIDを両時点で保持した。",
    true_experimental_unit: "organoid",
    identities: ["OrganoidID", "DonorID"],
    factors_conditions: [
      { name: "DoseGroup", levels: ["Low", "High"], unit_role: "between_unit" },
      { name: "Stimulation", levels: ["Before", "After"], unit_role: "within_unit" },
    ],
    condition_relationship: "mixed_blocked_by_donor",
    repeated_structure: "same organoid before and after stimulation",
    nested_structure: [
      { level: "donor", parent: null, role: "block" },
      { level: "organoid", parent: "donor", role: "experimental_unit" },
    ],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one organoid-condition record",
      column_semantics: "DonorID, OrganoidID, DoseGroup, Stimulation, luminescence",
    },
    expected_internal_design: {
      measurements: [{ name: "reporter luminescence", value_type: "continuous" }],
    },
  }),
  finalize({
    case_id: "EFS-053",
    domain: "human_ex_vivo",
    title: "同一ドナー左右組織のmatched処理",
    experiment_description:
      "膝置換術を受けた15名から同一関節内の隣接滑膜片を2片採取し、一方をvehicle、他方をサイトカインへ無作為に割り付けた。24時間培養後に各片のMMP3放出量を測定し、2片には同じDonorIDと別のExplantsIDを付けた。別ドナー間を対にしなかった。",
    true_experimental_unit: "synovial explant",
    identities: ["DonorID", "ExplantID"],
    factors_conditions: [
      { name: "Exposure", levels: ["Vehicle", "Cytokine"], unit_role: "within_unit" },
    ],
    condition_relationship: "matched_complete_by_donor",
    repeated_structure: "two condition-specific explants matched within donor",
    nested_structure: [],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "compact_unit_matrix",
      row_semantics: "one donor-matched set",
      column_semantics: "DonorID and one MMP3 value per exposure with ExplantID metadata",
    },
    expected_internal_design: {
      measurements: [{ name: "MMP3 release", value_type: "continuous" }],
    },
  }),
  finalize({
    case_id: "EFS-054",
    domain: "qpcr",
    title: "欠けたtechnical duplicateを含むqPCR",
    experiment_description:
      "独立な10培養からRNAを抽出し、各cDNAについてtargetとreferenceを原則2 wellずつ測定した。1培養のtargetの片方は増幅曲線不良で除外したが、残るwellを保持した。CultureID、Gene、TechnicalWellを各Ctに付け、wellを独立培養として数えなかった。",
    true_experimental_unit: "independent culture",
    identities: ["CultureID", "TechnicalWellID"],
    factors_conditions: [
      { name: "Gene", levels: ["Target", "Reference"], unit_role: "within_unit" },
    ],
    condition_relationship: "matched_incomplete_technical",
    repeated_structure: "genes and technical wells linked to the same culture",
    nested_structure: [
      { level: "independent culture", parent: null, role: "experimental_unit" },
      { level: "technical well", parent: "independent culture", role: "technical_replicate" },
    ],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "nested_observation_table",
      row_semantics: "one technical well result",
      column_semantics: "CultureID, TechnicalWellID, Gene, Ct, assay-failure reason",
    },
    expected_internal_design: {
      measurements: [{ name: "Ct", value_type: "continuous", observation_level: "technical well" }],
    },
  }),
  finalize({
    case_id: "EFS-055",
    domain: "animal_survival",
    title: "腫瘍移植後の死亡・安楽死・打切り",
    experiment_description:
      "40匹のマウスをvehicleまたは治療へ割り付けて腫瘍を移植し、移植日から毎日観察した。死亡または規定のhuman endpointで安楽死した日をevent日として記録し、試験終了時に生存していた個体は最終観察日までを打切りとして保存した。各MouseIDに追跡日数とevent有無を持たせた。",
    true_experimental_unit: "mouse",
    identities: ["MouseID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Vehicle", "Therapy"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "daily monitoring summarized as follow-up and event status",
    nested_structure: [],
    ordered_axes: [
      {
        name: "FollowUp",
        unit: "day",
        levels: [0, 1, 2, 3, 4, 5, 6, 7, 14, 21, 28],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "typed_record_table",
      row_semantics: "one animal survival record",
      column_semantics: "MouseID, Treatment, follow-up duration, event observed, event reason",
    },
    expected_internal_design: {
      measurements: [{ name: "survival", value_type: "time_to_event", axis_names: ["FollowUp"] }],
    },
  }),
  finalize({
    case_id: "EFS-056",
    domain: "pathology",
    title: "同一動物の反復ordinal score",
    experiment_description:
      "関節炎モデルラット20匹を2治療群へ割り付け、訓練した観察者が各個体の腫脹を0、3、7、10、14日に0〜4の順序尺度で評価した。RatIDを全日に保持し、欠測日は空欄の理由を記録した。各日で別個体を採点したのではない。",
    true_experimental_unit: "rat",
    identities: ["RatID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Control", "Drug"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "same rat scored repeatedly",
    nested_structure: [],
    ordered_axes: [
      {
        name: "Day",
        unit: "day",
        levels: [0, 3, 7, 10, 14],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "repeated_axis_matrix",
      row_semantics: "one rat",
      column_semantics: "RatID, Treatment and ordered day score columns with missingness",
    },
    expected_internal_design: {
      measurements: [
        { name: "arthritis score", value_type: "ordinal_scalar", axis_names: ["Day"] },
      ],
    },
  }),
  finalize({
    case_id: "EFS-057",
    domain: "biochemistry",
    title: "pulse-chaseで同一培養の標識消失追跡",
    experiment_description:
      "独立な16フラスコをcontrolまたはprotease inhibitorへ割り付け、短時間の標識pulse後に非標識培地へ交換した。各フラスコから0、15、30、60、120分に少量の培地を採取し、同じFlaskIDの標識タンパク量を追跡した。採取量は培養を破壊せず、途中でフラスコを交換しなかった。",
    true_experimental_unit: "culture flask",
    identities: ["FlaskID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Control", "ProteaseInhibitor"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "same flask across chase time",
    nested_structure: [],
    ordered_axes: [
      {
        name: "ChaseMinute",
        unit: "minute",
        levels: [0, 15, 30, 60, 120],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "repeated_axis_matrix",
      row_semantics: "one flask",
      column_semantics: "FlaskID, Treatment and ordered chase-time value columns",
    },
    expected_internal_design: {
      measurements: [
        { name: "labeled protein", value_type: "continuous", axis_names: ["ChaseMinute"] },
      ],
    },
  }),
  finalize({
    case_id: "EFS-058",
    domain: "immunology",
    title: "同一刺激wellのmultiplex cytokine panel",
    experiment_description:
      "9ドナーのPBMCを各ドナー内でunstimulatedまたはTLR agonist wellへ分け、24時間後の各well上清から8種類のcytokineを同時測定した。WellID、DonorID、刺激条件を全analyteに保持し、検出不能のanalyteだけを欠測として残した。",
    true_experimental_unit: "stimulation well",
    identities: ["DonorID", "WellID"],
    factors_conditions: [
      { name: "Stimulation", levels: ["Unstimulated", "TLRAgonist"], unit_role: "within_unit" },
    ],
    condition_relationship: "matched_complete_by_donor",
    repeated_structure: "condition-specific wells matched within donor; multiple readouts per well",
    nested_structure: [],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "compact_unit_matrix",
      row_semantics: "one donor matched set",
      column_semantics:
        "DonorID plus condition-by-analyte value columns and analyte-level missingness",
    },
    expected_internal_design: {
      measurements: ["IL-1b", "IL-6", "IL-8", "IL-10", "TNF", "CXCL10", "CCL2", "IFNg"].map(
        (name) => ({ name, value_type: "continuous" }),
      ),
    },
  }),
  finalize({
    case_id: "EFS-059",
    domain: "cell_screen",
    title: "plate batch内で割り付けた処理well",
    experiment_description:
      "3日に分けて作製した6枚の96-well plateそれぞれで、独立な細胞培養wellをvehicle、drug A、drug Bへ無作為に配置した。48時間後に各wellのATP発光を読み、PlateIDとWellIDを保持した。plateごとの培養条件差があり得るためPlateIDを削除せず、wellをtechnical replicateへ事前平均しなかった。",
    true_experimental_unit: "culture well",
    identities: ["PlateID", "WellID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Vehicle", "DrugA", "DrugB"], unit_role: "between_unit" },
    ],
    condition_relationship: "blocked_by_plate",
    repeated_structure: "none",
    nested_structure: [
      { level: "plate", parent: null, role: "block" },
      { level: "culture well", parent: "plate", role: "experimental_unit" },
    ],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one culture well",
      column_semantics: "PlateID, WellID, Treatment, ATP luminescence",
    },
    expected_internal_design: {
      measurements: [{ name: "ATP luminescence", value_type: "continuous" }],
    },
  }),
  finalize({
    case_id: "EFS-060",
    domain: "genetics",
    title: "knockdownとrescueの二因子細胞実験",
    experiment_description:
      "独立に播種した24ディッシュへcontrol siRNAまたはgene-X siRNAを導入し、同時にempty vectorまたはsiRNA-resistant gene-X rescue vectorを割り付けた。各4組合せに独立ディッシュを用い、48時間後に1ディッシュ1値の遊走面積を測定した。同じディッシュを複数組合せへ使わなかった。",
    true_experimental_unit: "culture dish",
    identities: ["DishID"],
    factors_conditions: [
      { name: "Knockdown", levels: ["ControlSiRNA", "GeneXSiRNA"], unit_role: "between_unit" },
      { name: "Rescue", levels: ["EmptyVector", "GeneXRescue"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent_factorial",
    repeated_structure: "none",
    nested_structure: [],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "one independently treated dish",
      column_semantics: "DishID, Knockdown, Rescue, migration area",
    },
    expected_internal_design: {
      measurements: [{ name: "migration area", value_type: "continuous" }],
    },
  }),
  finalize({
    case_id: "EFS-061",
    domain: "animal_husbandry",
    title: "cageに属するマウスの体温反復測定",
    experiment_description:
      "12ケージに4匹ずつ収容したマウスをケージ内でvehicleまたは薬剤へ割り付けた。各MouseIDの体温を投与前と1、4、8時間後に測定し、CageIDも保持した。処理は個体へ行い、餌をケージ単位で変えた実験ではない。",
    true_experimental_unit: "mouse",
    identities: ["MouseID", "CageID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Vehicle", "Drug"], unit_role: "between_unit" },
    ],
    condition_relationship: "blocked_by_cage",
    repeated_structure: "same mouse across time",
    nested_structure: [
      { level: "cage", parent: null, role: "block" },
      { level: "mouse", parent: "cage", role: "experimental_unit" },
    ],
    ordered_axes: [
      {
        name: "Hour",
        unit: "hour",
        levels: [0, 1, 4, 8],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "repeated_axis_matrix",
      row_semantics: "one mouse",
      column_semantics: "CageID, MouseID, Treatment and ordered time columns",
    },
    expected_internal_design: {
      measurements: [{ name: "body temperature", value_type: "continuous", axis_names: ["Hour"] }],
    },
  }),
  finalize({
    case_id: "EFS-062",
    domain: "spatial_biology",
    title: "左右腎の皮質・髄質sampling",
    experiment_description:
      "10匹のラットへ単一処置を行い、終了時に各個体の左右腎を回収した。各腎から皮質と髄質を別々に切り出し、各切片の代謝物量を測定した。RatID、Side、Region、TissuePieceIDを保持し、4切片を4匹として扱わなかった。",
    true_experimental_unit: "rat",
    identities: ["RatID", "TissuePieceID"],
    factors_conditions: [
      { name: "Side", levels: ["Left", "Right"], unit_role: "within_unit" },
      { name: "Region", levels: ["Cortex", "Medulla"], unit_role: "within_unit" },
    ],
    condition_relationship: "matched_complete",
    repeated_structure: "four condition-specific tissue pieces per rat",
    nested_structure: [
      { level: "rat", parent: null, role: "experimental_unit" },
      { level: "tissue piece", parent: "rat", role: "condition_specific_sample" },
    ],
    ordered_axes: [],
    natural_input_surface: {
      surface_id: "nested_observation_table",
      row_semantics: "one tissue piece",
      column_semantics: "RatID, TissuePieceID, Side, Region, metabolite amount",
    },
    expected_internal_design: {
      measurements: [
        { name: "metabolite amount", value_type: "continuous", observation_level: "tissue piece" },
      ],
    },
  }),
  finalize({
    case_id: "EFS-063",
    domain: "enzyme_kinetics",
    title: "基質濃度と阻害剤doseのkinetic plate",
    experiment_description:
      "精製酵素の独立調製物6本について、各調製物から基質濃度8段階と阻害剤濃度5段階の全組合せwellを作った。反応開始後30秒ごとに5分間吸光度を読み、PreparationID、substrate、inhibitor、elapsed timeを各wellに保持した。濃度応答曲線の係数へ事前要約しなかった。",
    true_experimental_unit: "enzyme preparation",
    identities: ["PreparationID", "WellID"],
    factors_conditions: [
      { name: "InhibitorDose", levels: ["0", "0.1", "0.3", "1", "3"], unit_role: "within_unit" },
    ],
    condition_relationship: "matched_complete",
    repeated_structure: "wells and time points linked within preparation",
    nested_structure: [],
    ordered_axes: [
      {
        name: "SubstrateConcentration",
        unit: "uM",
        levels: [1, 2, 5, 10, 20, 50, 100, 200],
        sampling: "cross_sectional",
        identity_retained: false,
      },
      {
        name: "ElapsedSecond",
        unit: "second",
        levels: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "typed_record_table",
      row_semantics: "one well-time kinetic record",
      column_semantics: "PreparationID, WellID, inhibitor dose, substrate dose, time, response",
    },
    expected_internal_design: {
      measurements: [
        {
          name: "enzyme response",
          value_type: "dose_response",
          axis_names: ["SubstrateConcentration", "ElapsedSecond"],
        },
      ],
    },
  }),
  finalize({
    case_id: "EFS-064",
    domain: "live_cell_microscopy",
    title: "time・z・channelを持つ細胞track",
    experiment_description:
      "4ディッシュの生細胞を2条件へ割り付け、各ディッシュの3視野で10分ごとに2時間撮像した。各時点で5 z-planeと2蛍光channelを取得し、同じ細胞のTrackIDを可能な範囲で維持した。DishID、FieldID、TrackID、time、z、channelを画像filenameから回収し、消失したtrackを別細胞へ接続しなかった。",
    true_experimental_unit: "culture dish",
    identities: ["DishID", "FieldID", "TrackID"],
    factors_conditions: [
      { name: "Treatment", levels: ["Control", "Drug"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure:
      "same cell track across time with nested field, z, and channel observations",
    nested_structure: [
      { level: "culture dish", parent: null, role: "experimental_unit" },
      { level: "field", parent: "culture dish", role: "sampling_location" },
      { level: "tracked cell", parent: "field", role: "subsample" },
    ],
    ordered_axes: [
      {
        name: "Minute",
        unit: "minute",
        levels: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
        sampling: "longitudinal",
        identity_retained: true,
      },
      {
        name: "ZPlane",
        unit: "index",
        levels: [1, 2, 3, 4, 5],
        sampling: "cross_sectional",
        identity_retained: true,
      },
      {
        name: "Channel",
        unit: "name",
        levels: ["GFP", "RFP"],
        sampling: "cross_sectional",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "nested_observation_table",
      row_semantics: "one cell-track image observation",
      column_semantics: "DishID, FieldID, TrackID, Treatment, Minute, ZPlane, Channel, intensity",
    },
    expected_internal_design: {
      measurements: [
        {
          name: "cell intensity",
          value_type: "continuous",
          observation_level: "tracked cell",
          axis_names: ["Minute", "ZPlane", "Channel"],
        },
      ],
    },
  }),
  finalize({
    case_id: "EFS-065",
    domain: "animal_multimodal",
    title: "longitudinal体重とterminal組織score",
    experiment_description:
      "24匹のマウスを2食餌群へ割り付け、0、2、4、8週に同じ個体の体重を測定した。8週に各個体を安楽死させ、肝臓から3視野を撮像して脂肪化scoreを視野別に記録した。MouseIDは体重と画像の両方に保持し、体重表と視野表を無理に同じ行へ押し込まなかった。",
    true_experimental_unit: "mouse",
    identities: ["MouseID", "FieldID"],
    factors_conditions: [
      { name: "Diet", levels: ["Control", "HighFat"], unit_role: "between_unit" },
    ],
    condition_relationship: "independent",
    repeated_structure: "body weight repeated within mouse; terminal fields nested within mouse",
    nested_structure: [
      { level: "mouse", parent: null, role: "experimental_unit" },
      { level: "field", parent: "mouse", role: "sampling_location" },
    ],
    ordered_axes: [
      {
        name: "Week",
        unit: "week",
        levels: [0, 2, 4, 8],
        sampling: "longitudinal",
        identity_retained: true,
      },
    ],
    natural_input_surface: {
      surface_id: "factor_observation_table",
      row_semantics: "typed long record bound to mouse-time or terminal field",
      column_semantics:
        "record type, MouseID, optional FieldID, Diet, optional Week, value, missingness",
    },
    expected_internal_design: {
      measurements: [
        {
          name: "body weight",
          value_type: "continuous",
          observation_level: "mouse",
          axis_names: ["Week"],
        },
        {
          name: "steatosis score",
          value_type: "ordinal_scalar",
          observation_level: "field",
          axis_names: [],
        },
      ],
    },
  }),
];
