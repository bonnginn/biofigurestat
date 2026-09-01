import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES, ERROR_CATALOG, researcherError } from "./errorCatalog";

describe("researcher-facing error catalog", () => {
  it("keeps stable unique IDs with an explanation and safe next action", () => {
    expect(new Set(APP_ERROR_CODES).size).toBe(APP_ERROR_CODES.length);
    APP_ERROR_CODES.forEach((code) => {
      expect(ERROR_CATALOG[code]).toMatchObject({ code });
      expect(ERROR_CATALOG[code].title.length).toBeGreaterThan(3);
      expect(ERROR_CATALOG[code].message.length).toBeGreaterThan(10);
      expect(ERROR_CATALOG[code].nextAction.length).toBeGreaterThan(10);
      expect(ERROR_CATALOG[code].nextAction).not.toMatch(/cell数をbiological nとして数えて続行/);
    });
  });

  it("separates user-correctable failures from application failures", () => {
    expect(ERROR_CATALOG.INVALID_PAIRED_STRUCTURE.category).toBe("user_correctable");
    expect(ERROR_CATALOG.UNSUPPORTED_ANALYSIS.category).toBe("user_correctable");
    expect(ERROR_CATALOG.ENGINE_EXECUTION_FAILED.category).toBe("application_failure");
    expect(ERROR_CATALOG.PROJECT_SAVE_FAILED.category).toBe("application_failure");
  });

  it("provides English application errors without changing stable codes or categories", () => {
    APP_ERROR_CODES.forEach((code) => {
      const japanese = researcherError(code);
      const english = researcherError(code, "en");
      expect(english).toMatchObject({ code, category: japanese.category });
      expect(`${english.title} ${english.message} ${english.nextAction}`).not.toMatch(
        /[\u3040-\u30ff\u3400-\u9fff]/u,
      );
    });
  });
});
