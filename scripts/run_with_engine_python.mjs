#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = resolve(
  root,
  process.platform === "win32"
    ? "engine/python/.venv/Scripts/python.exe"
    : "engine/python/.venv/bin/python",
);

if (!existsSync(python)) {
  console.error(`Pinned Python environment is missing: ${python}`);
  console.error(
    "Create engine/python/.venv and install engine/python/pyproject.toml dependencies.",
  );
  process.exit(1);
}
const pythonArguments = process.argv.slice(2);
const pnpmSeparator = pythonArguments.indexOf("--");
if (pnpmSeparator !== -1) {
  pythonArguments.splice(pnpmSeparator, 1);
}

if (pythonArguments.length === 0) {
  console.error("Usage: node scripts/run_with_engine_python.mjs <python arguments...>");
  process.exit(2);
}

const child = spawn(python, pythonArguments, {
  cwd: root,
  env: { ...process.env, LSAA_NODE_EXECUTABLE: process.execPath },
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (error) => {
  console.error(`Could not start pinned Python: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
