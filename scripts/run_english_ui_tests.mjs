import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UI_ROOT = resolve(ROOT, "apps/ui");
const UI_SOURCE_ROOT = resolve(UI_ROOT, "src");

export function isEnglishUiContractTest(path, source) {
  return (
    /\.test\.tsx?$/u.test(path.replaceAll("\\", "/")) && /\bexpectNoJapaneseUi\s*\(/u.test(source)
  );
}

export function collectEnglishUiContractTests(directory = UI_SOURCE_ROOT) {
  const selected = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        [".ts", ".tsx"].includes(extname(entry.name)) &&
        isEnglishUiContractTest(path, readFileSync(path, "utf8"))
      ) {
        selected.push(path);
      }
    }
  };
  visit(directory);
  return selected.sort((left, right) => left.localeCompare(right));
}

function run() {
  const selected = collectEnglishUiContractTests();
  if (selected.length === 0) {
    process.stderr.write("No English UI contract tests were found.\n");
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`Running ${selected.length} English UI contract test files.\n`);
  const vitest = resolve(UI_ROOT, "node_modules/vitest/vitest.mjs");
  const result = existsSync(vitest)
    ? spawnSync(process.execPath, [vitest, "run", "--reporter=dot", ...selected], {
        cwd: UI_ROOT,
        stdio: "inherit",
        shell: false,
      })
    : spawnSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["--filter", "@lsaa/ui", "exec", "vitest", "run", "--reporter=dot", ...selected],
        { cwd: ROOT, stdio: "inherit", shell: false },
      );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) run();
