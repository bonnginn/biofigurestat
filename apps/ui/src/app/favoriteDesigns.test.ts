import { createExperimentSetDraft } from "./experimentDraft";
import { loadFavoriteDesigns, removeFavoriteDesign, saveFavoriteDesign } from "./favoriteDesigns";

describe("favorite designs", () => {
  beforeEach(() => localStorage.clear());

  it("stores design structure without measurement cells and can remove it", () => {
    const draft = createExperimentSetDraft("cell_culture", "proportion");
    const saved = saveFavoriteDesign(draft, [], new Date("2026-08-21T00:00:00.000Z"));
    expect(loadFavoriteDesigns()).toEqual([saved]);
    expect(JSON.stringify(saved)).not.toContain("rawValues");

    removeFavoriteDesign(saved.id);
    expect(loadFavoriteDesigns()).toEqual([]);
  });

  it("ignores corrupted local data", () => {
    localStorage.setItem("lsaa.favorite-designs.v1", "not-json");
    expect(loadFavoriteDesigns()).toEqual([]);
  });
});
