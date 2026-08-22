import type { ExperimentSetDraft } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

const STORAGE_KEY = "lsaa.favorite-designs.v1";

export type FavoriteGraphDefault = Pick<
  WorkspaceGraphState,
  "graphType" | "layers" | "appearance" | "axes"
>;

export type FavoriteDesign = Readonly<{
  id: string;
  name: string;
  savedAt: string;
  draft: ExperimentSetDraft;
  graphDefaults: readonly FavoriteGraphDefault[];
}>;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isFavoriteDesign(value: unknown): value is FavoriteDesign {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FavoriteDesign>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.savedAt === "string" &&
    Boolean(candidate.draft) &&
    candidate.draft?.version === "0.1.0" &&
    Array.isArray(candidate.graphDefaults)
  );
}

export function loadFavoriteDesigns(): FavoriteDesign[] {
  const value = storage()?.getItem(STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isFavoriteDesign) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteDesign(
  draft: ExperimentSetDraft,
  graphs: readonly WorkspaceGraphState[],
  now = new Date(),
): FavoriteDesign {
  const favorite: FavoriteDesign = {
    id: `favorite.${now.getTime()}`,
    name: draft.name,
    savedAt: now.toISOString(),
    draft,
    graphDefaults: graphs.map(({ graphType, layers, appearance, axes }) => ({
      graphType,
      layers,
      appearance,
      axes,
    })),
  };
  const next = [favorite, ...loadFavoriteDesigns().filter(({ id }) => id !== favorite.id)];
  storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  return favorite;
}

export function removeFavoriteDesign(id: string): void {
  storage()?.setItem(
    STORAGE_KEY,
    JSON.stringify(loadFavoriteDesigns().filter((favorite) => favorite.id !== id)),
  );
}
