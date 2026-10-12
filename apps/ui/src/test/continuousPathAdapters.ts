/// <reference types="node" />
/**
 * TEST ONLY: physical SQLite adapters for the one continuous App path.
 * This does not invoke Tauri, Rust, native IPC, or the desktop storage adapter.
 * Inner format: apps/desktop/src-tauri/src/project_database.rs and the unchanged
 * packages/project/migrations/0001_initial.sql through 0004_adaptive_input.sql.
 * Outer format: apps/desktop/src-tauri/src/project_storage.rs, specifically
 * create_single_file_container (lsaa-sqlite-container-v1), via the Python helper.
 * os.replace/fsync tests do not establish native crash recovery or compatibility.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ProjectDatabaseCodec,
  ProjectPackageStorage,
  ProjectState,
  Sha256Function,
} from "@lsaa/project";

const CONTAINER_FORMAT = "lsaa-sqlite-container-v1";
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_HELPER_OUTPUT_BYTES = 128 * 1024 * 1024;
const MIGRATIONS = [
  "0001_initial.sql",
  "0002_derived_datasets.sql",
  "0003_experiment_workspace.sql",
  "0004_adaptive_input.sql",
] as const;

export type ContinuousPathAdapterEvent = {
  operation: string;
  target?: string;
  relativePath?: string;
  bytes?: number;
  entryCount?: number;
  query?: string;
  rowCount?: number;
  userVersion?: number;
  implementation: "test-only-node-python-sqlite";
};

type JsonObject = Record<string, unknown>;
type TableSpec = {
  table: string;
  stateKey: string;
  fields: readonly (readonly [string, string])[];
  since: number;
};

// Only these fixed identifiers enter SQL. record_json retains the complete record.
const TABLES: readonly TableSpec[] = [
  { table: "design_revisions", stateKey: "designRevisions", since: 1, fields: [["id", "id"], ["previousRevisionId", "previous_revision_id"], ["createdAt", "created_at"]] },
  { table: "raw_revisions", stateKey: "rawRevisions", since: 1, fields: [["id", "id"], ["previousRevisionId", "previous_revision_id"], ["createdAt", "created_at"]] },
  { table: "unit_instances", stateKey: "unitInstances", since: 1, fields: [["id", "id"], ["levelId", "level_id"], ["parentUnitId", "parent_unit_id"]] },
  { table: "observations", stateKey: "observations", since: 1, fields: [["id", "id"], ["rawRevisionId", "raw_revision_id"], ["unitInstanceId", "unit_instance_id"], ["conditionId", "condition_id"], ["outcomeId", "outcome_id"]] },
  { table: "transformations", stateKey: "transformations", since: 2, fields: [["id", "id"]] },
  { table: "derived_dataset_revisions", stateKey: "derivedDatasetRevisions", since: 2, fields: [["id", "id"], ["sourceRawRevisionId", "source_raw_revision_id"], ["transformationId", "transformation_id"], ["state", "state"]] },
  { table: "derived_values", stateKey: "derivedValues", since: 2, fields: [["id", "id"], ["derivedDatasetRevisionId", "derived_dataset_revision_id"], ["experimentalUnitId", "experimental_unit_id"], ["conditionId", "condition_id"], ["outcomeId", "outcome_id"]] },
  { table: "analysis_runs", stateKey: "analysisRuns", since: 1, fields: [["id", "id"], ["inputDesignRevisionId", "input_design_revision_id"], ["inputRawRevisionId", "input_raw_revision_id"], ["state", "state"]] },
  { table: "graphs", stateKey: "graphs", since: 1, fields: [["id", "id"], ["sourceAnalysisRunId", "source_analysis_run_id"], ["state", "state"]] },
  { table: "provenance_events", stateKey: "provenanceEvents", since: 1, fields: [["id", "id"], ["kind", "kind"], ["targetId", "target_id"], ["occurredAt", "occurred_at"]] },
];

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonObject;
}

function stringField(value: JsonObject, key: string): string {
  if (typeof value[key] !== "string") throw new Error(`Missing string field ${key}`);
  return value[key];
}

function json(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Missing JSON value");
  return encoded;
}

function copyBytes(value: Uint8Array): Uint8Array {
  // ArrayBuffer.isView accepts a Uint8Array from Vitest's other realm and Buffer.
  if (!ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== "[object Uint8Array]") {
    throw new Error("Expected Uint8Array or Buffer bytes");
  }
  return Uint8Array.from(value);
}

function assertNoDotSegments(path: string): void {
  if (path.includes("\0") || path.split(/[\\/]+/).some((part) => part === "." || part === "..")) {
    throw new Error("Dot segments and NUL are forbidden in adapter paths");
  }
}

function assertInside(root: string, path: string, allowRoot = false): void {
  const rel = relative(root, path);
  if ((!allowRoot && rel === "") || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error("Adapter path is outside the allocated output root");
  }
}

function rejectLinksAndCheckPhysicalPath(root: string, path: string, allowRoot = false): void {
  assertInside(root, path, allowRoot);
  let ancestor = path;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("Adapter path has no existing ancestor");
    ancestor = parent;
  }
  assertInside(root, realpathSync(ancestor), true);
  let current = ancestor;
  while (current !== root) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Symlink/junction adapter paths are forbidden");
    const parent = dirname(current);
    if (parent === current) throw new Error("Adapter path escaped its root");
    current = parent;
  }
}

function entryPath(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024 || path.includes("\\") || path.startsWith("/")) {
    throw new Error("Invalid relative container entry path");
  }
  const parts = path.split("/");
  if (parts.some((part) => {
    const unsafeCharacter = part.split("").some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === ":";
    });
    return !part || part === "." || part === ".." || unsafeCharacter || /[. ]$/.test(part);
  })) {
    throw new Error("Unsafe container entry path");
  }
  return path;
}

function integrity(db: DatabaseSync): void {
  const rows = db.prepare("PRAGMA integrity_check").all();
  if (rows.length !== 1 || Object.values(rows[0])[0] !== "ok") throw new Error("Physical SQLite integrity_check failed");
}

function fsyncFile(path: string): void {
  const fd = openSync(path, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function createContinuousPathAdapters(options: {
  outputRoot: string;
  candidateRoot: string;
  pythonExecutable: string;
  containerHelperPath: string;
}): {
  storage: ProjectPackageStorage;
  databaseCodec: ProjectDatabaseCodec;
  sha256: Sha256Function;
  ioEvents: ContinuousPathAdapterEvent[];
} {
  for (const path of Object.values(options)) {
    if (!isAbsolute(path)) throw new Error("Adapter roots and executable/helper paths must be absolute");
    assertNoDotSegments(path);
  }
  const candidateRoot = realpathSync(resolve(options.candidateRoot));
  if (!lstatSync(candidateRoot).isDirectory()) throw new Error("Candidate root must be a directory");
  const workspaceRoot = realpathSync(dirname(candidateRoot));
  const outputRoot = resolve(options.outputRoot);
  rejectLinksAndCheckPhysicalPath(workspaceRoot, outputRoot);
  mkdirSync(outputRoot, { recursive: true });
  rejectLinksAndCheckPhysicalPath(workspaceRoot, outputRoot);
  if (!lstatSync(outputRoot).isDirectory()) throw new Error("Output root must be a directory");
  const physicalOutputRoot = realpathSync(outputRoot);
  const pythonExecutable = realpathSync(options.pythonExecutable);
  const containerHelperPath = realpathSync(options.containerHelperPath);
  rejectLinksAndCheckPhysicalPath(workspaceRoot, containerHelperPath);
  if (!lstatSync(pythonExecutable).isFile() || !lstatSync(containerHelperPath).isFile()) {
    throw new Error("Python executable and container helper must be files");
  }
  const migrations = MIGRATIONS.map((name) => readFileSync(join(candidateRoot, "packages", "project", "migrations", name), "utf8"));
  const ioEvents: ContinuousPathAdapterEvent[] = [];
  const event = (entry: Omit<ContinuousPathAdapterEvent, "implementation">): void => {
    ioEvents.push({ ...entry, implementation: "test-only-node-python-sqlite" });
  };
  const activeWrites = new Set<string>();

  function targetPath(target: string): string {
    if (!isAbsolute(target)) throw new Error("Container target must be absolute");
    assertNoDotSegments(target);
    const path = resolve(target);
    rejectLinksAndCheckPhysicalPath(physicalOutputRoot, path);
    if (!basename(path).toLowerCase().endsWith(".lsa")) throw new Error("Expected an .lsa file target");
    if (existsSync(path) && !lstatSync(path).isFile()) throw new Error("Container target must be a regular file");
    return path;
  }

  async function helper(input: JsonObject): Promise<JsonObject> {
    return new Promise((resolveResult, rejectResult) => {
      const child = spawn(pythonExecutable, [containerHelperPath], {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      });
      const chunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderr = "";
      let settled = false;
      const finishError = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        rejectResult(error);
      };
      const timer = setTimeout(() => finishError(new Error("Test SQLite container helper timed out")), 60000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > MAX_HELPER_OUTPUT_BYTES) {
          finishError(new Error("Test SQLite container helper output exceeded its bound"));
          return;
        }
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 16384) stderr += chunk.toString("utf8"); });
      child.on("error", finishError);
      child.stdin.on("error", finishError);
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          rejectResult(new Error(`Test SQLite container helper failed (${code}): ${stderr.trim()}`));
          return;
        }
        try {
          const result = object(JSON.parse(Buffer.concat(chunks).toString("utf8")), "Helper response");
          if (result.ok !== true || result.containerFormat !== CONTAINER_FORMAT) throw new Error("Invalid SQLite container helper response");
          resolveResult(result);
        } catch (error) { rejectResult(error); }
      });
      child.stdin.end(json({ ...input, outputRoot: physicalOutputRoot, workspaceRoot }));
    });
  }

  function withDiskDatabase<T>(operation: (path: string) => T): T {
    const directory = mkdtempSync(join(physicalOutputRoot, "inner-sqlite-"));
    const path = join(directory, "project.sqlite");
    try { return operation(path); } finally {
      // Delete only files in this freshly allocated private directory, never recursively.
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        const ownedPath = `${path}${suffix}`;
        if (existsSync(ownedPath)) {
          rejectLinksAndCheckPhysicalPath(physicalOutputRoot, ownedPath);
          unlinkSync(ownedPath);
        }
      }
      rejectLinksAndCheckPhysicalPath(physicalOutputRoot, directory);
      rmdirSync(directory);
    }
  }

  const databaseCodec: ProjectDatabaseCodec = {
    async encode(state: ProjectState): Promise<Uint8Array> {
      // IPC supplies JSON to Rust; the same JSON boundary is used here.
      const source = object(JSON.parse(json(state)), "Project state");
      return withDiskDatabase((path) => {
        const db = new DatabaseSync(path);
        try {
          for (const migration of migrations) db.exec(migration);
          db.prepare("INSERT INTO project_state (singleton, state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id, experiment_workspace_json, adaptive_input_json) VALUES (1, ?, ?, ?, ?, ?, ?)").run(
            stringField(source, "schemaVersion"),
            json(source.metadata),
            stringField(source, "activeDesignRevisionId"),
            stringField(source, "activeRawRevisionId"),
            source.experimentWorkspace == null ? null : json(source.experimentWorkspace),
            source.adaptiveInput == null ? null : json(source.adaptiveInput),
          );
          for (const spec of TABLES) {
            const records = source[spec.stateKey];
            if (!Array.isArray(records)) throw new Error(`Missing array ${spec.stateKey}`);
            const columns = ["sequence", ...spec.fields.map(([, column]) => column), "record_json"];
            const sql = `INSERT INTO ${spec.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
            const statement = db.prepare(sql);
            records.forEach((record, sequence) => {
              const fields = object(record, `${spec.table} record`);
              const values: (string | number | null)[] = [sequence];
              for (const [field] of spec.fields) {
                if (!Object.hasOwn(fields, field) || (fields[field] !== null && typeof fields[field] !== "string")) {
                  throw new Error(`${spec.table}.${field} must be a string or null`);
                }
                values.push(fields[field] as string | null);
              }
              values.push(json(record));
              statement.run(...values);
            });
            event({ operation: "sqlite.encode.records", query: sql, rowCount: records.length });
          }
          integrity(db);
          const version = Number(Object.values(db.prepare("PRAGMA user_version").get() ?? {})[0]);
          if (version !== 4) throw new Error("Encoded project database must use migration version 4");
          event({ operation: "sqlite.encode.integrity_check", userVersion: version });
        } finally { db.close(); }
        fsyncFile(path);
        const bytes = Uint8Array.from(readFileSync(path));
        event({ operation: "sqlite.encode.physical_file", bytes: bytes.byteLength });
        return bytes;
      });
    },
    async decode(input: Uint8Array): Promise<unknown> {
      const bytes = copyBytes(input);
      if (bytes.byteLength > MAX_ENTRY_BYTES) throw new Error("Project database exceeds test adapter byte bound");
      return withDiskDatabase((path) => {
        writeFileSync(path, bytes, { flag: "wx" });
        fsyncFile(path);
        const db = new DatabaseSync(path, { readOnly: true });
        try {
          integrity(db);
          const version = Number(Object.values(db.prepare("PRAGMA user_version").get() ?? {})[0]);
          if (![1, 2, 3, 4].includes(version)) throw new Error(`Unsupported project database version ${version}`);
          const workspaceColumn = version >= 3 ? ", experiment_workspace_json" : "";
          const adaptiveColumn = version >= 4 ? ", adaptive_input_json" : "";
          const row = db.prepare(`SELECT state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id${workspaceColumn}${adaptiveColumn} FROM project_state WHERE singleton = 1`).get();
          if (!row) throw new Error("Missing project_state singleton");
          const fields = object(row, "Project state row");
          const optionalJson = (key: string): unknown => {
            if (fields[key] === undefined || fields[key] === null) return null;
            return JSON.parse(stringField(fields, key));
          };
          const state: JsonObject = {
            schemaVersion: stringField(fields, "state_schema_version"),
            metadata: JSON.parse(stringField(fields, "metadata_json")),
            activeDesignRevisionId: stringField(fields, "active_design_revision_id"),
            activeRawRevisionId: stringField(fields, "active_raw_revision_id"),
            experimentWorkspace: optionalJson("experiment_workspace_json"),
            adaptiveInput: optionalJson("adaptive_input_json"),
          };
          for (const spec of TABLES) {
            if (version < spec.since) { state[spec.stateKey] = []; continue; }
            const query = `SELECT record_json FROM ${spec.table} ORDER BY sequence`;
            const rows = db.prepare(query).all();
            state[spec.stateKey] = rows.map((record) => JSON.parse(stringField(object(record, `${spec.table} row`), "record_json")));
            event({ operation: "sqlite.decode.records", query, rowCount: rows.length });
          }
          event({ operation: "sqlite.decode.physical_integrity_check", bytes: bytes.byteLength, userVersion: version });
          return state;
        } finally { db.close(); }
      });
    },
  };

  const storage: ProjectPackageStorage = {
    async readFile(target: string, relativePath: string): Promise<Uint8Array> {
      const path = targetPath(target);
      const entry = entryPath(relativePath);
      const result = await helper({ operation: "read", target: path, relativePath: entry });
      const encoded = stringField(result, "data");
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("Invalid helper base64");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded || result.bytes !== bytes.byteLength || bytes.byteLength > MAX_ENTRY_BYTES) throw new Error("Invalid helper byte count");
      event({ operation: "storage.readFile", target: path, relativePath: entry, bytes: bytes.byteLength });
      return Uint8Array.from(bytes);
    },
    async beginAtomicWrite(target: string) {
      const path = targetPath(target);
      const key = path.toLowerCase();
      if (activeWrites.has(key)) throw new Error("A test transaction already owns this target");
      mkdirSync(dirname(path), { recursive: true });
      rejectLinksAndCheckPhysicalPath(physicalOutputRoot, path);
      activeWrites.add(key);
      const entries = new Map<string, Uint8Array>();
      const folded = new Set<string>();
      let totalBytes = 0;
      let status: "open" | "committed" | "failed" | "rolled_back" = "open";
      event({ operation: "storage.beginAtomicWrite", target: path });
      return {
        async writeFile(relativePath: string, input: Uint8Array): Promise<void> {
          if (status !== "open") throw new Error("Test transaction is closed");
          const entry = entryPath(relativePath);
          const foldedEntry = entry.toLowerCase();
          if (folded.has(foldedEntry)) throw new Error("Duplicate/case-folded container entry");
          const bytes = copyBytes(input);
          if (bytes.byteLength > MAX_ENTRY_BYTES || totalBytes + bytes.byteLength > MAX_PAYLOAD_BYTES || entries.size >= MAX_ENTRIES) throw new Error("Test container payload bound exceeded");
          entries.set(entry, bytes);
          folded.add(foldedEntry);
          totalBytes += bytes.byteLength;
          event({ operation: "storage.writeFile", target: path, relativePath: entry, bytes: bytes.byteLength });
        },
        async commit(): Promise<void> {
          if (status !== "open") throw new Error("Test transaction is closed");
          const encoded: Record<string, string> = Object.create(null) as Record<string, string>;
          for (const [entry, bytes] of entries) encoded[entry] = Buffer.from(bytes).toString("base64");
          try {
            const result = await helper({ operation: "write", target: path, entries: encoded });
            if (result.entryCount !== entries.size) throw new Error("Container helper entry count mismatch");
            status = "committed";
            activeWrites.delete(key);
            event({ operation: "storage.commit", target: path, bytes: totalBytes, entryCount: entries.size });
            entries.clear();
          } catch (error) { status = "failed"; throw error; }
        },
        async rollback(): Promise<void> {
          if (status === "committed" || status === "rolled_back") return;
          status = "rolled_back";
          entries.clear();
          activeWrites.delete(key);
          event({ operation: "storage.rollback", target: path });
          // The helper removes only its own staged sibling; the existing target is retained.
        },
      };
    },
  };
  const sha256: Sha256Function = async (bytes) => createHash("sha256").update(copyBytes(bytes)).digest("hex");
  return { storage, databaseCodec, sha256, ioEvents };
}
