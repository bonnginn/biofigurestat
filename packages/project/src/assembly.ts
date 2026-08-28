import type { Observation } from "@lsaa/domain";
import { ProjectManifestSchema, type ProjectManifest } from "./manifest";
import type { ProjectFilePayloads, Sha256Function } from "./package-io";
import { ProjectStateSchema, type ProjectState } from "./state";

const DATABASE_PATH = "project.sqlite";
const RAW_EXPORT_PATH = "raw/exports/canonical.csv";
const TRANSFORMATION_EXPORT_PATH = "derived/lineage.json";

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCanonicalRawCsv(stateInput: ProjectState): Uint8Array {
  const state = ProjectStateSchema.parse(stateInput);
  const active = state.observations.filter(
    (observation) => observation.rawRevisionId === state.activeRawRevisionId,
  );
  const unitById = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  const design = state.designRevisions.find(
    (revision) => revision.id === state.activeDesignRevisionId,
  )?.design;
  const experimentalUnitAncestor = (unitId: string) => {
    const visited = new Set<string>();
    let current = unitById.get(unitId);
    while (current) {
      if (visited.has(current.id)) return undefined;
      visited.add(current.id);
      if (current.levelId === design?.experimentalUnitLevelId) return current;
      current = current.parentUnitId ? unitById.get(current.parentUnitId) : undefined;
    }
    return undefined;
  };
  const rows = [
    [
      "observation_id",
      "raw_revision_id",
      "unit_instance_id",
      "unit_level_id",
      "parent_unit_id",
      "experimental_unit_ancestor_id",
      "experiment_date",
      "condition_id",
      "outcome_id",
      "measurement_kind",
      "value",
      "numerator",
      "denominator",
      "target_intensity",
      "loading_control_intensity",
      "transformation_version",
      "wb_source_method",
      "wb_target_intensity",
      "wb_target_background",
      "wb_target_area",
      "wb_reference_intensity",
      "wb_reference_background",
      "wb_reference_area",
      "category_counts_json",
      "time",
      "dose",
      "technical_replicate_id",
      "source_location",
      "record_role",
      "derivation_id",
      "source_observation_ids",
    ],
    ...active.map((observation: Observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      const ancestor = experimentalUnitAncestor(observation.unitInstanceId);
      return [
        observation.id,
        observation.rawRevisionId,
        observation.unitInstanceId,
        unit?.levelId,
        unit?.parentUnitId,
        ancestor?.id,
        observation.experimentDate,
        observation.conditionId,
        observation.outcomeId,
        observation.measurement.kind,
        observation.measurement.kind === "scalar" ? observation.measurement.value : null,
        observation.measurement.kind === "proportion" ? observation.measurement.numerator : null,
        observation.measurement.kind === "proportion" ? observation.measurement.denominator : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.target
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.loadingControl
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.transformationVersion
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.method
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.target.intensity
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.target.background
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.target.area
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.loadingControl.intensity
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.loadingControl.background
          : null,
        observation.measurement.kind === "loading_control_ratio"
          ? observation.measurement.sourceMeasurements?.loadingControl.area
          : null,
        observation.measurement.kind === "categorical_counts"
          ? JSON.stringify(observation.measurement.counts)
          : null,
        observation.time,
        observation.dose,
        observation.technicalReplicateId,
        observation.sourceLocation,
        "source_observation",
        null,
        null,
      ];
    }),
  ];
  const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  return new TextEncoder().encode(csv);
}

export type ProjectPackageAssembly = {
  manifest: ProjectManifest;
  payloads: ProjectFilePayloads;
};

export async function assembleProjectPackage(
  stateInput: ProjectState,
  database: Uint8Array,
  sha256: Sha256Function,
  appVersion: string,
  savedAt: string,
): Promise<ProjectPackageAssembly> {
  const state = ProjectStateSchema.parse(stateInput);
  const rawExport = createCanonicalRawCsv(state);
  const transformationExport = new TextEncoder().encode(
    `${JSON.stringify(
      {
        transformations: state.transformations,
        derivedDatasetRevisions: state.derivedDatasetRevisions,
        derivedValues: state.derivedValues,
      },
      null,
      2,
    )}\n`,
  );
  const payloads = {
    [DATABASE_PATH]: database,
    [RAW_EXPORT_PATH]: rawExport,
    [TRANSFORMATION_EXPORT_PATH]: transformationExport,
  };
  const manifest = ProjectManifestSchema.parse({
    format: "life-science-analysis-project",
    formatVersion: "0.2.0",
    projectKind: "experiment",
    projectId: state.metadata.projectId,
    metadata: { ...state.metadata, updatedAt: savedAt },
    appVersion,
    schemaVersions: {
      design: state.designRevisions.at(-1)?.design.schemaVersion ?? "0.2.0",
      data: state.schemaVersion,
      analysis: "0.5.0",
      graph: "0.1.0",
    },
    createdAt: state.metadata.createdAt,
    savedAt,
    files: [
      {
        path: DATABASE_PATH,
        role: "database",
        sha256: await sha256(database),
        sizeBytes: database.byteLength,
      },
      {
        path: RAW_EXPORT_PATH,
        role: "raw_export",
        sha256: await sha256(rawExport),
        sizeBytes: rawExport.byteLength,
      },
      {
        path: TRANSFORMATION_EXPORT_PATH,
        role: "other",
        sha256: await sha256(transformationExport),
        sizeBytes: transformationExport.byteLength,
      },
    ],
    recovery: {
      canonicalRawExportPath: RAW_EXPORT_PATH,
      databasePath: DATABASE_PATH,
      transformationExportPath: TRANSFORMATION_EXPORT_PATH,
    },
  });
  return { manifest, payloads };
}
