import assert from "node:assert/strict";
import test from "node:test";

import { isEnglishUiContractTest } from "./run_english_ui_tests.mjs";

test("selects test files that exercise the English UI residue assertion", () => {
  assert.equal(
    isEnglishUiContractTest(
      "apps/ui/src/pages/Page.test.tsx",
      'import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi"; expectNoJapaneseUi(view);',
    ),
    true,
  );
});

test("does not select production source or tests that only mention the helper", () => {
  assert.equal(
    isEnglishUiContractTest("apps/ui/src/pages/Page.tsx", "expectNoJapaneseUi(view);"),
    false,
  );
  assert.equal(
    isEnglishUiContractTest(
      "apps/ui/src/pages/Page.test.tsx",
      "const helperName = 'expectNoJapaneseUi';",
    ),
    false,
  );
});
