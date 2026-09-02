import type { AdaptiveSurfaceId } from "@lsaa/domain";
import type { AdaptiveLocale } from "@lsaa/adaptive-input";
import { ADAPTIVE_SURFACE_GRAMMAR } from "@lsaa/adaptive-input";

type SurfaceGrammarText = Readonly<{ row: string; columns: string }>;

const SURFACE_TITLES: Readonly<Record<AdaptiveSurfaceId, Readonly<{ ja: string; en: string }>>> = {
  compact_unit_matrix: { ja: "条件ごとの対応入力", en: "Matched-unit table" },
  factor_observation_table: { ja: "観測ごとの入力表", en: "Observation table" },
  repeated_axis_matrix: { ja: "時点・順序ごとの対応入力", en: "Repeated ordered-axis table" },
  nested_observation_table: { ja: "階層化した観測の入力表", en: "Nested-observation table" },
  typed_record_table: { ja: "測定形式に対応した入力表", en: "Typed measurement table" },
};

const JAPANESE_SURFACE_GRAMMAR: Readonly<Record<AdaptiveSurfaceId, SurfaceGrammarText>> = {
  compact_unit_matrix: {
    row: "1つの安定した実験単位または対応組",
    columns: "identityと、小規模な条件・測定項目の行列",
  },
  factor_observation_table: {
    row: "1つの実験単位・測定項目の観測",
    columns: "identity、要因、任意のordered axis、測定項目、値、欠測情報",
  },
  repeated_axis_matrix: {
    row: "1つの安定したidentity",
    columns: "identity・要因とordered-axis水準（long形式も取込可能）",
  },
  nested_observation_table: {
    row: "宣言した最下位levelの1つのraw観測",
    columns: "上位identity、下位identity、要因、axis、値",
  },
  typed_record_table: {
    row: "1つの型付き測定記録",
    columns: "identity・要因と、測定形式固有の構成値",
  },
};

export function adaptiveSurfaceGrammar(
  locale: AdaptiveLocale,
  surfaceId: AdaptiveSurfaceId,
): SurfaceGrammarText {
  return locale === "ja"
    ? JAPANESE_SURFACE_GRAMMAR[surfaceId]
    : ADAPTIVE_SURFACE_GRAMMAR[surfaceId];
}

export function adaptiveSurfaceTitle(locale: AdaptiveLocale, surfaceId: AdaptiveSurfaceId): string {
  return SURFACE_TITLES[surfaceId][locale];
}
