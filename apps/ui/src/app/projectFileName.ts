const WINDOWS_RESERVED = /[<>:"/\\|?*]/g;

/** Produces a cross-platform-safe default without changing the project name itself. */
export function defaultProjectFileName(projectName: string): string {
  const stem = projectName
    .normalize("NFKC")
    .split("")
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
    .join("")
    .replace(WINDOWS_RESERVED, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return `${stem || "BioFigureStat project"}.lsa`;
}
