const WINDOWS_RESERVED = /[<>:"/\\|?*]/g;
const WINDOWS_DEVICE_STEM = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

/** Protects a file stem while retaining the user's visible project or graph name. */
export function protectWindowsDeviceFileStem(stem: string): string {
  return WINDOWS_DEVICE_STEM.test(stem.normalize("NFKC")) ? `_${stem}` : stem;
}

/** Produces a cross-platform-safe default without changing the project name itself. */
export function defaultProjectFileName(projectName: string): string {
  const stem = projectName
    .normalize("NFKC")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(WINDOWS_RESERVED, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  // Windows reserves device names even when an extension follows the name.
  const safeStem = protectWindowsDeviceFileStem(stem).slice(0, 120);
  return `${safeStem || "BioFigureStat project"}.lsa`;
}
