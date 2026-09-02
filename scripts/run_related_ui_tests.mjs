import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UI_ROOT = resolve(ROOT, "apps/ui");

export function relatedSourcePaths(paths) {
  return paths
    .map((path) => path.trim().replaceAll("\\", "/"))
    .filter(Boolean)
    .filter((path) => /^(?:apps\/ui\/src|packages\/[^/]+\/src)\/.+\.(?:tsx?|css)$/u.test(path))
    .filter((path) => !path.endsWith(".d.ts"));
}

export function parseBaseArgument(arguments_) {
  if (arguments_.length === 0) return "HEAD";
  if (arguments_.length === 2 && arguments_[0] === "--base" && arguments_[1]) {
    return arguments_[1];
  }
  throw new Error("Usage: pnpm test:ui:related [--base <git-ref>]");
}

function run() {
  const base = parseBaseArgument(process.argv.slice(2));
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRT", base, "--", "apps/ui/src", "packages"],
    { encoding: "utf8", shell: false },
  );
  if (diff.status !== 0) {
    process.stderr.write(diff.stderr || `git diff failed with exit code ${diff.status}\n`);
    process.exit(diff.status ?? 1);
  }
  const deleted = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=D", base, "--", "apps/ui/src", "packages"],
    { encoding: "utf8", shell: false },
  );
  if (deleted.status !== 0) {
    process.stderr.write(deleted.stderr || `git diff failed with exit code ${deleted.status}\n`);
    process.exit(deleted.status ?? 1);
  }
  const deletedSources = relatedSourcePaths(deleted.stdout.split(/\r?\n/u));
  if (deletedSources.length > 0) {
    process.stderr.write(
      `Cannot infer related tests for ${deletedSources.length} deleted source files; run explicit focused tests.\n`,
    );
    process.exit(2);
  }
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "apps/ui/src", "packages"],
    { encoding: "utf8", shell: false },
  );
  if (untracked.status !== 0) {
    process.stderr.write(untracked.stderr || `git ls-files failed with exit code ${untracked.status}\n`);
    process.exit(untracked.status ?? 1);
  }
  const related = relatedSourcePaths(
    `${diff.stdout}\n${untracked.stdout}`.split(/\r?\n/u),
  );
  if (related.length === 0) {
    process.stdout.write(`No changed UI-related TypeScript files since ${base}.\n`);
    return;
  }
  process.stdout.write(`Running tests related to ${related.length} changed source files.\n`);
  const vitest = resolve(UI_ROOT, "node_modules/vitest/vitest.mjs");
  const result = existsSync(vitest)
    ? spawnSync(
        process.execPath,
        [
          vitest,
          "related",
          "--run",
          "--reporter=dot",
          ...related.map((path) => resolve(ROOT, path)),
        ],
        {
          cwd: UI_ROOT,
          stdio: "inherit",
          shell: false,
        },
      )
    : spawnSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        [
          "--filter",
          "@lsaa/ui",
          "exec",
          "vitest",
          "related",
          "--run",
          "--reporter=dot",
          ...related,
        ],
        { cwd: ROOT, stdio: "inherit", shell: false },
      );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) run();
