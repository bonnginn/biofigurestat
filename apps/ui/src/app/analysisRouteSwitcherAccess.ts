export type AnalysisRouteSwitcherAccess = "development_audit";

/**
 * The analysis-first switcher is a development/audit aid, not a researcher-facing
 * production entry. Requiring both signals makes a production build fail closed
 * even if a test/debug caller accidentally requests the switcher.
 */
export function resolveAnalysisRouteSwitcherAccess({
  developmentBuild,
  auditModeRequested,
}: Readonly<{
  developmentBuild: boolean;
  auditModeRequested: boolean;
}>): AnalysisRouteSwitcherAccess | null {
  return developmentBuild && auditModeRequested ? "development_audit" : null;
}
