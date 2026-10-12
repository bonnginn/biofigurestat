import { describe, expect, it } from "vitest";
import { CanonicalWorksheetFileError, parseCanonicalWorksheetFile } from "./canonicalWorksheetFile";

describe("Windows canonical file ingress closing-quote boundary", () => {
  it.each([" ", "\t", "\u00a0"])(
    "rejects malformed CSV instead of normalizing suffix %j into a cell",
    (suffix) => {
      expect(() =>
        parseCanonicalWorksheetFile({
          fileName: "synthetic-invalid.csv",
          mimeType: "text/csv",
          text: `Label,Value\n"Drug"${suffix},1`,
          layout: {
            columns: [
              { key: "row_label", header: "Label", role: "row_label" },
              { key: "value", header: "Value", role: "value", semanticKey: "response" },
            ],
          },
        }),
      ).toThrow(CanonicalWorksheetFileError);
    },
  );
});
