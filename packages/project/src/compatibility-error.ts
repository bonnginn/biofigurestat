export const PROJECT_COMPATIBILITY_ERROR_CODES = [
  "PROJECT_SCHEMA_VERSION_MISSING",
  "PROJECT_SCHEMA_VERSION_NEWER_THAN_APP",
  "PROJECT_SCHEMA_VERSION_UNSUPPORTED",
  "PROJECT_CONTENT_INVALID",
  "PROJECT_KIND_MISMATCH",
] as const;

export type ProjectCompatibilityErrorCode = (typeof PROJECT_COMPATIBILITY_ERROR_CODES)[number];

/**
 * A stable project-boundary failure. Technical details remain in `cause`; UI
 * code must translate `code` instead of parsing or displaying schema/parser text.
 */
export class ProjectCompatibilityError extends Error {
  readonly code: ProjectCompatibilityErrorCode;
  readonly foundVersion: string | null;
  readonly supportedVersion: string | null;

  constructor(
    code: ProjectCompatibilityErrorCode,
    options: {
      foundVersion?: string | null;
      supportedVersion?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(code, { cause: options.cause });
    this.name = "ProjectCompatibilityError";
    this.code = code;
    this.foundVersion = options.foundVersion ?? null;
    this.supportedVersion = options.supportedVersion ?? null;
  }
}
