import { ProjectManifestSchema, type ProjectManifest } from "./manifest";

const MANIFEST_PATH = "manifest.json";

export type ProjectFilePayloads = Readonly<Record<string, Uint8Array>>;
export type Sha256Function = (data: Uint8Array) => Promise<string>;

export interface AtomicProjectWrite {
  writeFile(relativePath: string, data: Uint8Array): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ProjectPackageStorage {
  readFile(target: string, relativePath: string): Promise<Uint8Array>;
  beginAtomicWrite(target: string): Promise<AtomicProjectWrite>;
}

export type OpenedProjectPackage = {
  manifest: ProjectManifest;
  files: Record<string, Uint8Array>;
};

export function encodeProjectManifest(manifest: ProjectManifest): Uint8Array {
  const validated = ProjectManifestSchema.parse(manifest);
  return new TextEncoder().encode(`${JSON.stringify(validated, null, 2)}\n`);
}

export function decodeProjectManifest(data: Uint8Array): ProjectManifest {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  return ProjectManifestSchema.parse(JSON.parse(text));
}

async function validatePayloads(
  manifest: ProjectManifest,
  payloads: ProjectFilePayloads,
  sha256: Sha256Function,
): Promise<void> {
  const declaredPaths = new Set(manifest.files.map((file) => file.path));
  const suppliedPaths = Object.keys(payloads);
  if (suppliedPaths.some((path) => !declaredPaths.has(path))) {
    throw new Error("Project save contains a file that is not declared by the manifest");
  }
  if (manifest.files.some((file) => payloads[file.path] === undefined)) {
    throw new Error("Project save is missing a file declared by the manifest");
  }

  for (const file of manifest.files) {
    const data = payloads[file.path];
    if (data.byteLength !== file.sizeBytes) {
      throw new Error(`Project file size does not match the manifest: ${file.path}`);
    }
    if ((await sha256(data)) !== file.sha256) {
      throw new Error(`Project file checksum does not match the manifest: ${file.path}`);
    }
  }
}

export async function saveProjectPackage(
  storage: ProjectPackageStorage,
  target: string,
  manifestInput: ProjectManifest,
  payloads: ProjectFilePayloads,
  sha256: Sha256Function,
): Promise<void> {
  const manifest = ProjectManifestSchema.parse(manifestInput);
  await validatePayloads(manifest, payloads, sha256);

  const transaction = await storage.beginAtomicWrite(target);
  try {
    for (const file of manifest.files) {
      await transaction.writeFile(file.path, payloads[file.path]);
    }
    await transaction.writeFile(MANIFEST_PATH, encodeProjectManifest(manifest));
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function openProjectPackage(
  storage: ProjectPackageStorage,
  target: string,
  sha256: Sha256Function,
): Promise<OpenedProjectPackage> {
  const manifest = decodeProjectManifest(await storage.readFile(target, MANIFEST_PATH));
  const files: Record<string, Uint8Array> = {};
  for (const file of manifest.files) {
    const data = await storage.readFile(target, file.path);
    if (data.byteLength !== file.sizeBytes || (await sha256(data)) !== file.sha256) {
      throw new Error(`Project file failed integrity validation: ${file.path}`);
    }
    files[file.path] = data;
  }
  return { manifest, files };
}
