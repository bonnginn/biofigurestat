/**
 * Optional research-area context for the isolated UI prototype.
 *
 * This state is deliberately kept outside guided biological answers. It may
 * adapt examples and placeholder vocabulary, but it must never select an
 * observation pattern, measurement form, condition topology, or data surface.
 */

export const RESEARCH_CONTEXT_IDS = Object.freeze([
  "cell_culture",
  "microscopy",
  "protein_biochemistry",
  "animal",
  "general",
]);

const RESEARCH_CONTEXT_SET = new Set(RESEARCH_CONTEXT_IDS);

const LEGACY_CONTEXT_ALIASES = Object.freeze({
  microscopy_imaging: "microscopy",
  protein_biochemical: "protein_biochemistry",
  general_assay: "general",
});

const PRESENTATION = Object.freeze({
  unspecified: Object.freeze({
    contextLabel: "未指定",
    contextHint: "必要な場合だけ選んでください。入力例の言葉が変わるだけで、実験構造の判定には使いません。",
    experimentPlaceholder: "例：薬剤処理によるシグナル変化",
    measurementPlaceholder: "例：シグナル強度",
    sourcePlaceholder: "例：culture dish、mouse、独立に調製したsample",
  }),
  cell_culture: Object.freeze({
    contextLabel: "細胞・培養",
    contextHint: "dish・well・培養試料に合う入力例を表示します。構造は、この後の実験上の回答から決めます。",
    experimentPlaceholder: "例：薬剤処理による細胞応答",
    measurementPlaceholder: "例：細胞数、陽性数、蛍光強度",
    sourcePlaceholder: "例：culture dish、well、独立に始めた培養",
  }),
  microscopy: Object.freeze({
    contextLabel: "顕微鏡・画像解析",
    contextHint: "視野・Cell・ROIに合う入力例を表示します。Cellを独立したnとして自動判断はしません。",
    experimentPlaceholder: "例：処理後のCell形態と蛍光",
    measurementPlaceholder: "例：蛍光強度、Cell area、陽性数",
    sourcePlaceholder: "例：culture dish、組織切片、撮像した動物",
  }),
  protein_biochemistry: Object.freeze({
    contextLabel: "タンパク質・生化学",
    contextHint: "sample・lysate・元の測定値に合う入力例を表示します。正規化方法はここでは決めません。",
    experimentPlaceholder: "例：処理後のタンパク質シグナル",
    measurementPlaceholder: "例：band intensity、活性、濃度",
    sourcePlaceholder: "例：独立に調製したsample、lysate、culture dish",
  }),
  animal: Object.freeze({
    contextLabel: "動物",
    contextHint: "個体・組織に合う入力例を表示します。同じ個体か別個体かは、この後の回答から決めます。",
    experimentPlaceholder: "例：投与後の個体測定",
    measurementPlaceholder: "例：体重、腫瘍体積、シグナル強度",
    sourcePlaceholder: "例：mouse、rat、個体から採取したsample",
  }),
  general: Object.freeze({
    contextLabel: "その他の定量測定",
    contextHint: "特定分野に寄らない入力例を表示します。実験構造は、この後の回答から決めます。",
    experimentPlaceholder: "例：処理条件による測定値の変化",
    measurementPlaceholder: "例：吸光度、発光、活性、濃度",
    sourcePlaceholder: "例：独立に調製したsample、反応容器、測定対象",
  }),
});

export function normalizeResearchContext(value) {
  const raw = String(value ?? "").trim();
  const normalized = LEGACY_CONTEXT_ALIASES[raw] ?? raw;
  return RESEARCH_CONTEXT_SET.has(normalized) ? normalized : "";
}

/** `existing_data` is an ingress choice, never a biological context. */
export function researchContextIngress(value) {
  const raw = String(value ?? "").trim();
  return Object.freeze({
    researchContext: normalizeResearchContext(raw),
    entryMode: raw === "existing_data" ? "direct" : "guided",
  });
}

export function researchContextPresentation(value) {
  return PRESENTATION[normalizeResearchContext(value) || "unspecified"];
}

/**
 * Change optional presentation context without replacing or editing any
 * biological answers, spreadsheet cells, observations, or selected surface.
 */
export function selectResearchContext(entryState, value) {
  if (!entryState || typeof entryState !== "object") {
    throw new TypeError("entryState must be an object");
  }
  return { ...entryState, researchContext: normalizeResearchContext(value) };
}
