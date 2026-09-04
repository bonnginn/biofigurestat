import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBaseArgument,
  relatedSourcePaths,
  repositoryGitArguments,
} from "./run_related_ui_tests.mjs";

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

test("marks the repository as safe for non-interactive git subprocesses", () => {
  const arguments_ = repositoryGitArguments(["diff", "--name-only", "HEAD"]);
  assert.equal(arguments_[0], "-c");
  assert.match(arguments_[1], /^safe\.directory=.+/u);
  assert.deepEqual(arguments_.slice(2), ["diff", "--name-only", "HEAD"]);
});
