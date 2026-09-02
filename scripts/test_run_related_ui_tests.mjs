import assert from "node:assert/strict";
import test from "node:test";

import { parseBaseArgument, relatedSourcePaths } from "./run_related_ui_tests.mjs";

test("selects UI and shared-package sources without generated declarations", () => {
  assert.deepEqual(
    relatedSourcePaths([
      "apps\\ui\\src\\pages\\ExperimentWorkspace.tsx",
      "apps/ui/src/app.css",
      "packages/graph-spec/src/index.ts",
      "packages/project/src/schema.test.ts",
      "apps/ui/src/vite-env.d.ts",
      "docs/agent/CURRENT_STATE.md",
      "",
    ]),
    [
      "apps/ui/src/pages/ExperimentWorkspace.tsx",
      "apps/ui/src/app.css",
      "packages/graph-spec/src/index.ts",
      "packages/project/src/schema.test.ts",
    ],
  );
});

test("uses the working tree by default and accepts one explicit base", () => {
  assert.equal(parseBaseArgument([]), "HEAD");
  assert.equal(parseBaseArgument(["--base", "origin/main"]), "origin/main");
  assert.throws(() => parseBaseArgument(["--base"]), /Usage/);
  assert.throws(() => parseBaseArgument(["HEAD~2"]), /Usage/);
});
