const STORAGE_KEY = "lsaa.recent-projects.v1";
const MAX_RECENT_PROJECTS = 12;

export type RecentProject = Readonly<{
  target: string;
  name: string;
  lastOpenedAt: string;
}>;

export function loadRecentProjects(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentProject =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as RecentProject).target === "string" &&
        typeof (item as RecentProject).name === "string" &&
        typeof (item as RecentProject).lastOpenedAt === "string",
    );
  } catch {
    return [];
  }
}

export function rememberRecentProject(
  project: Readonly<{ target: string; name: string }>,
  now = new Date(),
): RecentProject[] {
  const entry: RecentProject = {
    target: project.target,
    name: project.name,
    lastOpenedAt: now.toISOString(),
  };
  const next = [
    entry,
    ...loadRecentProjects().filter(({ target }) => target !== project.target),
  ].slice(0, MAX_RECENT_PROJECTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeRecentProject(target: string): RecentProject[] {
  const next = loadRecentProjects().filter((project) => project.target !== target);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
