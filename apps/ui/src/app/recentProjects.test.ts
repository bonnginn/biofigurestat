import { beforeEach, describe, expect, it } from "vitest";

import { loadRecentProjects, rememberRecentProject, removeRecentProject } from "./recentProjects";

describe("recent projects", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the latest local target first without duplicating it", () => {
    rememberRecentProject({ target: "/tmp/a.lsa", name: "A" }, new Date("2026-08-20T00:00:00Z"));
    rememberRecentProject({ target: "/tmp/b.lsa", name: "B" }, new Date("2026-08-21T00:00:00Z"));
    rememberRecentProject(
      { target: "/tmp/a.lsa", name: "A updated" },
      new Date("2026-08-22T00:00:00Z"),
    );
    expect(loadRecentProjects()).toEqual([
      { target: "/tmp/a.lsa", name: "A updated", lastOpenedAt: "2026-08-22T00:00:00.000Z" },
      { target: "/tmp/b.lsa", name: "B", lastOpenedAt: "2026-08-21T00:00:00.000Z" },
    ]);
  });

  it("removes only the selected target and recovers from malformed storage", () => {
    rememberRecentProject({ target: "/tmp/a.lsa", name: "A" });
    expect(removeRecentProject("/tmp/a.lsa")).toEqual([]);
    localStorage.setItem("lsaa.recent-projects.v1", "not-json");
    expect(loadRecentProjects()).toEqual([]);
  });
});
