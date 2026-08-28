import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  ProjectMetadataSchema,
  Sha256Schema,
} from "@lsaa/domain";

export const PROJECT_FORMAT_VERSION = "0.2.0" as const;

const PackageRelativePathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !path.startsWith("\\"), {
    message: "Project package paths must be relative",
  })
  .refine((path) => !/^[A-Za-z]:[\\/]/.test(path), {
    message: "Project package paths must not contain a drive prefix",
  })
  .refine((path) => !path.includes("\\"), {
    message: "Project package paths must use forward slashes on every platform",
  })
  .refine(
    (path) =>
      !path
        .replaceAll("\\", "/")
        .split("/")
        .some((segment) => segment === ".." || segment === "." || segment.length === 0),
    { message: "Project package paths must be normalized and remain inside the package" },
  );

export const ProjectManifestSchema = z
  .object({
    format: z.literal("life-science-analysis-project"),
    formatVersion: z.literal(PROJECT_FORMAT_VERSION),
    /** Selects the state reader without implying biological semantics. */
    projectKind: z
      .enum(["experiment", "unresolved_visualization", "progressive_experiment"])
      .default("experiment"),
    projectId: EntityIdSchema,
    metadata: ProjectMetadataSchema,
    appVersion: z.string().min(1),
    schemaVersions: z.object({
      design: z.string().min(1),
      data: z.string().min(1),
      analysis: z.string().min(1),
      graph: z.string().min(1),
    }),
    createdAt: IsoDateTimeSchema,
    savedAt: IsoDateTimeSchema,
    files: z.array(
      z.object({
        path: PackageRelativePathSchema,
        role: z.enum(["database", "raw_source", "raw_export", "asset", "other"]),
        sha256: Sha256Schema,
        sizeBytes: z.number().int().nonnegative(),
      }),
    ),
    recovery: z.object({
      canonicalRawExportPath: PackageRelativePathSchema,
      databasePath: PackageRelativePathSchema,
      transformationExportPath: PackageRelativePathSchema.optional(),
    }),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.projectId !== manifest.metadata.projectId) {
      ctx.addIssue({
        code: "custom",
        path: ["metadata", "projectId"],
        message: "Manifest and metadata project IDs must match",
      });
    }

    const fileByPath = new Map<string, (typeof manifest.files)[number]>();
    const portablePaths = new Set<string>();
    manifest.files.forEach((file, index) => {
      if (fileByPath.has(file.path)) {
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Project package file paths must be unique",
        });
      }
      fileByPath.set(file.path, file);
      const portablePath = file.path.toLocaleLowerCase("en-US");
      if (portablePath === "manifest.json" || portablePaths.has(portablePath)) {
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message:
            portablePath === "manifest.json"
              ? "manifest.json is reserved for project metadata"
              : "Project paths must remain unique on case-insensitive file systems",
        });
      }
      portablePaths.add(portablePath);
    });

    const database = fileByPath.get(manifest.recovery.databasePath);
    if (database?.role !== "database") {
      ctx.addIssue({
        code: "custom",
        path: ["recovery", "databasePath"],
        message: "Recovery databasePath must reference a declared database file",
      });
    }

    const rawExport = fileByPath.get(manifest.recovery.canonicalRawExportPath);
    if (rawExport?.role !== "raw_export") {
      ctx.addIssue({
        code: "custom",
        path: ["recovery", "canonicalRawExportPath"],
        message: "Recovery canonicalRawExportPath must reference a declared raw export file",
      });
    }

    if (manifest.recovery.transformationExportPath) {
      const transformationExport = fileByPath.get(manifest.recovery.transformationExportPath);
      if (transformationExport?.role !== "other") {
        ctx.addIssue({
          code: "custom",
          path: ["recovery", "transformationExportPath"],
          message: "Recovery transformationExportPath must reference a declared auxiliary file",
        });
      }
    }
  });

export const MigrationRecordSchema = z.object({
  id: EntityIdSchema,
  fromVersion: z.string().min(1),
  toVersion: z.string().min(1),
  appliedAt: IsoDateTimeSchema,
  appVersion: z.string().min(1),
  backupPath: z.string().min(1),
  status: z.enum(["completed", "rolled_back", "failed"]),
});

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
