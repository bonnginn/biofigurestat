use rusqlite::{params, Connection, OpenFlags};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const INITIAL_MIGRATION: &str =
    include_str!("../../../../packages/project/migrations/0001_initial.sql");
const DERIVED_DATASETS_MIGRATION: &str =
    include_str!("../../../../packages/project/migrations/0002_derived_datasets.sql");
const EXPERIMENT_WORKSPACE_MIGRATION: &str =
    include_str!("../../../../packages/project/migrations/0003_experiment_workspace.sql");
const ADAPTIVE_INPUT_MIGRATION: &str =
    include_str!("../../../../packages/project/migrations/0004_adaptive_input.sql");
static DATABASE_COUNTER: AtomicU64 = AtomicU64::new(0);
const MATRIX_VIEWS_MIGRATION: &str =
    include_str!("../../../../packages/project/migrations/0005_matrix_views.sql");

fn validate_matrix_views(views: &Value) -> Result<(), String> {
    let records = views.as_array().ok_or("matrixViews must be an array")?;
    for view in records {
        let record = record_object(view)?;
        if record.keys().any(|key| {
            !["id", "rawMatrix", "spec", "createdAt", "createdBy"].contains(&key.as_str())
        }) {
            return Err("Unsupported matrix view field; input is unchanged".into());
        }
        for key in ["id", "createdAt", "createdBy"] {
            required_string(record, key)?;
        }
        let raw = record
            .get("rawMatrix")
            .and_then(Value::as_object)
            .ok_or("Matrix raw input is missing")?;
        if raw.keys().any(|key| {
            ![
                "version",
                "rowIds",
                "rowLabels",
                "columnIds",
                "columnLabels",
                "values",
            ]
            .contains(&key.as_str())
        }) {
            return Err("Unsupported raw matrix field; input is unchanged".into());
        }
        let spec = record
            .get("spec")
            .and_then(Value::as_object)
            .ok_or("Matrix Graph spec is missing")?;
        if raw.get("version").and_then(Value::as_str) != Some("0.1.0")
            || spec.get("version").and_then(Value::as_str) != Some("0.1.0")
            || spec.get("type").and_then(Value::as_str) != Some("heatmap")
        {
            return Err("Unsupported matrix or Graph version/type".into());
        }
        let heatmap = spec
            .get("heatmap")
            .and_then(Value::as_object)
            .ok_or("Heatmap settings are missing")?;
        if spec.keys().any(|key| {
            ![
                "id",
                "version",
                "type",
                "dataSource",
                "analysisResultId",
                "dataSets",
                "mappings",
                "summary",
                "appearance",
                "axes",
                "editorPresentation",
                "distribution",
                "heatmap",
                "annotations",
                "facet",
            ]
            .contains(&key.as_str())
        }) || heatmap.keys().any(|key| {
            ![
                "transform",
                "transformVersion",
                "min",
                "max",
                "missingColor",
                "showCellValues",
            ]
            .contains(&key.as_str())
        }) {
            return Err("Unsupported matrix Graph field; input is unchanged".into());
        }
        if heatmap.get("transformVersion").and_then(Value::as_str) != Some("0.1.0") {
            return Err("Unsupported heatmap transform version".into());
        }
        let rows = required_array(raw, "rowIds")?;
        let columns = required_array(raw, "columnIds")?;
        let values = required_array(raw, "values")?;
        for ids in [
            rows,
            columns,
            required_array(raw, "rowLabels")?,
            required_array(raw, "columnLabels")?,
        ] {
            if ids
                .iter()
                .any(|value| value.as_str().map_or(true, str::is_empty))
            {
                return Err("Matrix identities and labels must be nonempty strings".into());
            }
        }
        if rows.iter().collect::<std::collections::HashSet<_>>().len() != rows.len()
            || columns
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != columns.len()
        {
            return Err("Matrix identities must be unique".into());
        }
        if rows.is_empty()
            || columns.is_empty()
            || rows.len() != required_array(raw, "rowLabels")?.len()
            || columns.len() != required_array(raw, "columnLabels")?.len()
            || rows.len() != values.len()
            || values.iter().any(|row| {
                row.as_array().map_or(true, |cells| {
                    cells.len() != columns.len()
                        || cells
                            .iter()
                            .any(|cell| !cell.is_null() && !cell.is_number())
                })
            })
        {
            return Err("Invalid matrix dimensions or values".into());
        }
    }
    Ok(())
}

fn temporary_database_path() -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock cannot create a temporary database: {error}"))?
        .as_nanos();
    let counter = DATABASE_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(std::env::temp_dir().join(format!(
        "lsaa-project-{}-{nanos}-{counter}.sqlite",
        std::process::id()
    )))
}

fn required_string<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Project state is missing string field {key}"))
}

fn required_array<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a Vec<Value>, String> {
    object
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Project state is missing array field {key}"))
}

fn record_object(record: &Value) -> Result<&Map<String, Value>, String> {
    record
        .as_object()
        .ok_or_else(|| "Project state record must be an object".to_string())
}

fn insert_json_records(
    connection: &Connection,
    table: &str,
    records: &[Value],
    fields: &[(&str, &str)],
) -> Result<(), String> {
    let placeholders = (1..=fields.len() + 2)
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let columns = std::iter::once("sequence")
        .chain(fields.iter().map(|(_, column)| *column))
        .chain(std::iter::once("record_json"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("INSERT INTO {table} ({columns}) VALUES ({placeholders})");
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Could not prepare {table} persistence: {error}"))?;

    for (index, record) in records.iter().enumerate() {
        let object = record_object(record)?;
        let mut values = Vec::with_capacity(fields.len() + 2);
        values.push(rusqlite::types::Value::Integer(index as i64));
        for (json_field, _) in fields {
            let value = object.get(*json_field).ok_or_else(|| {
                format!("Project {table} record is missing required field {json_field}")
            })?;
            values.push(match value {
                Value::Null => rusqlite::types::Value::Null,
                Value::String(value) => rusqlite::types::Value::Text(value.clone()),
                _ => {
                    return Err(format!(
                        "Project {table} field {json_field} must be a string or null"
                    ))
                }
            });
        }
        values.push(rusqlite::types::Value::Text(
            serde_json::to_string(record)
                .map_err(|error| format!("Could not encode a {table} record: {error}"))?,
        ));
        statement
            .execute(rusqlite::params_from_iter(values))
            .map_err(|error| format!("Could not persist a {table} record: {error}"))?;
    }
    Ok(())
}

fn encode_to_path(state: &Value, path: &PathBuf) -> Result<(), String> {
    let object = state
        .as_object()
        .ok_or_else(|| "Project state must be an object".to_string())?;
    if let Some(views) = object.get("matrixViews") {
        validate_matrix_views(views)?;
    }
    let connection = Connection::open(path)
        .map_err(|error| format!("Could not create the project database: {error}"))?;
    connection
        .execute_batch(&format!(
            "{INITIAL_MIGRATION}\n{DERIVED_DATASETS_MIGRATION}\n{EXPERIMENT_WORKSPACE_MIGRATION}\n{ADAPTIVE_INPUT_MIGRATION}"
        ))
        .map_err(|error| format!("Could not initialize the project database: {error}"))?;
    connection
        .execute(
            "INSERT INTO project_state (singleton, state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id, experiment_workspace_json, adaptive_input_json) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                required_string(object, "schemaVersion")?,
                serde_json::to_string(object.get("metadata").ok_or_else(|| "Project state is missing metadata".to_string())?)
                    .map_err(|error| format!("Could not encode project metadata: {error}"))?,
                required_string(object, "activeDesignRevisionId")?,
                required_string(object, "activeRawRevisionId")?,
                object
                    .get("experimentWorkspace")
                    .filter(|value| !value.is_null())
                    .map(serde_json::to_string)
                    .transpose()
                    .map_err(|error| format!("Could not encode experiment workspace: {error}"))?,
                object
                    .get("adaptiveInput")
                    .filter(|value| !value.is_null())
                    .map(serde_json::to_string)
                    .transpose()
                    .map_err(|error| format!("Could not encode adaptive input: {error}"))?,
            ],
        )
        .map_err(|error| format!("Could not persist project metadata: {error}"))?;

    if let Some(views) = object.get("matrixViews") {
        connection
            .execute_batch(MATRIX_VIEWS_MIGRATION)
            .map_err(|error| format!("Could not initialize matrix persistence: {error}"))?;
        connection
            .execute(
                "UPDATE project_state SET matrix_views_json = ?1 WHERE singleton = 1",
                [serde_json::to_string(views).map_err(|error| error.to_string())?],
            )
            .map_err(|error| format!("Could not persist matrices: {error}"))?;
    }

    insert_json_records(
        &connection,
        "design_revisions",
        required_array(object, "designRevisions")?,
        &[
            ("id", "id"),
            ("previousRevisionId", "previous_revision_id"),
            ("createdAt", "created_at"),
        ],
    )?;
    insert_json_records(
        &connection,
        "raw_revisions",
        required_array(object, "rawRevisions")?,
        &[
            ("id", "id"),
            ("previousRevisionId", "previous_revision_id"),
            ("createdAt", "created_at"),
        ],
    )?;
    insert_json_records(
        &connection,
        "unit_instances",
        required_array(object, "unitInstances")?,
        &[
            ("id", "id"),
            ("levelId", "level_id"),
            ("parentUnitId", "parent_unit_id"),
        ],
    )?;
    insert_json_records(
        &connection,
        "observations",
        required_array(object, "observations")?,
        &[
            ("id", "id"),
            ("rawRevisionId", "raw_revision_id"),
            ("unitInstanceId", "unit_instance_id"),
            ("conditionId", "condition_id"),
            ("outcomeId", "outcome_id"),
        ],
    )?;
    insert_json_records(
        &connection,
        "transformations",
        required_array(object, "transformations")?,
        &[("id", "id")],
    )?;
    insert_json_records(
        &connection,
        "derived_dataset_revisions",
        required_array(object, "derivedDatasetRevisions")?,
        &[
            ("id", "id"),
            ("sourceRawRevisionId", "source_raw_revision_id"),
            ("transformationId", "transformation_id"),
            ("state", "state"),
        ],
    )?;
    insert_json_records(
        &connection,
        "derived_values",
        required_array(object, "derivedValues")?,
        &[
            ("id", "id"),
            ("derivedDatasetRevisionId", "derived_dataset_revision_id"),
            ("experimentalUnitId", "experimental_unit_id"),
            ("conditionId", "condition_id"),
            ("outcomeId", "outcome_id"),
        ],
    )?;
    insert_json_records(
        &connection,
        "analysis_runs",
        required_array(object, "analysisRuns")?,
        &[
            ("id", "id"),
            ("inputDesignRevisionId", "input_design_revision_id"),
            ("inputRawRevisionId", "input_raw_revision_id"),
            ("state", "state"),
        ],
    )?;
    insert_json_records(
        &connection,
        "graphs",
        required_array(object, "graphs")?,
        &[
            ("id", "id"),
            ("sourceAnalysisRunId", "source_analysis_run_id"),
            ("state", "state"),
        ],
    )?;
    insert_json_records(
        &connection,
        "provenance_events",
        required_array(object, "provenanceEvents")?,
        &[
            ("id", "id"),
            ("kind", "kind"),
            ("targetId", "target_id"),
            ("occurredAt", "occurred_at"),
        ],
    )?;

    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not validate the project database: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "New project database failed integrity validation: {integrity}"
        ));
    }
    connection
        .close()
        .map_err(|(_, error)| format!("Could not finalize the project database: {error}"))
}

fn read_json_records(connection: &Connection, table: &str) -> Result<Vec<Value>, String> {
    let sql = format!("SELECT record_json FROM {table} ORDER BY sequence");
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("Could not read {table}: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Could not query {table}: {error}"))?;
    rows.map(|row| {
        let encoded = row.map_err(|error| format!("Could not read a {table} record: {error}"))?;
        serde_json::from_str(&encoded)
            .map_err(|error| format!("Could not decode a {table} record: {error}"))
    })
    .collect()
}

fn decode_from_path(path: &PathBuf) -> Result<Value, String> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not open the project database: {error}"))?;
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not validate the project database: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "Project database failed integrity validation: {integrity}"
        ));
    }
    let user_version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("Could not read the project database version: {error}"))?;
    if !(1..=5).contains(&user_version) {
        return Err(format!(
            "Unsupported project database version {user_version}"
        ));
    }

    let (
        schema_version,
        metadata_json,
        active_design,
        active_raw,
        workspace_json,
        adaptive_input_json,
    ): (
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
    ) = if user_version >= 4 {
        connection
            .query_row(
                "SELECT state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id, experiment_workspace_json, adaptive_input_json FROM project_state WHERE singleton = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .map_err(|error| format!("Could not read project state metadata: {error}"))?
    } else if user_version >= 3 {
        connection
            .query_row(
                "SELECT state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id, experiment_workspace_json FROM project_state WHERE singleton = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, None)),
            )
            .map_err(|error| format!("Could not read project state metadata: {error}"))?
    } else {
        let legacy: (String, String, String, String) = connection
                .query_row(
                    "SELECT state_schema_version, metadata_json, active_design_revision_id, active_raw_revision_id FROM project_state WHERE singleton = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .map_err(|error| format!("Could not read project state metadata: {error}"))?;
        (legacy.0, legacy.1, legacy.2, legacy.3, None, None)
    };
    let metadata: Value = serde_json::from_str(&metadata_json)
        .map_err(|error| format!("Could not decode project metadata: {error}"))?;
    let experiment_workspace: Value = workspace_json
        .map(|encoded| serde_json::from_str(&encoded))
        .transpose()
        .map_err(|error| format!("Could not decode experiment workspace: {error}"))?
        .unwrap_or(Value::Null);
    let adaptive_input: Value = adaptive_input_json
        .map(|encoded| serde_json::from_str(&encoded))
        .transpose()
        .map_err(|error| format!("Could not decode adaptive input: {error}"))?
        .unwrap_or(Value::Null);
    let transformations = if user_version >= 2 {
        read_json_records(&connection, "transformations")?
    } else {
        Vec::new()
    };
    let derived_dataset_revisions = if user_version >= 2 {
        read_json_records(&connection, "derived_dataset_revisions")?
    } else {
        Vec::new()
    };
    let derived_values = if user_version >= 2 {
        read_json_records(&connection, "derived_values")?
    } else {
        Vec::new()
    };
    let mut state = json!({
        "schemaVersion": schema_version,
        "metadata": metadata,
        "designRevisions": read_json_records(&connection, "design_revisions")?,
        "activeDesignRevisionId": active_design,
        "rawRevisions": read_json_records(&connection, "raw_revisions")?,
        "activeRawRevisionId": active_raw,
        "unitInstances": read_json_records(&connection, "unit_instances")?,
        "observations": read_json_records(&connection, "observations")?,
        "transformations": transformations,
        "derivedDatasetRevisions": derived_dataset_revisions,
        "derivedValues": derived_values,
        "analysisRuns": read_json_records(&connection, "analysis_runs")?,
        "graphs": read_json_records(&connection, "graphs")?,
        "experimentWorkspace": experiment_workspace,
        "adaptiveInput": adaptive_input,
        "provenanceEvents": read_json_records(&connection, "provenance_events")?,
    });
    if user_version >= 5 {
        let encoded: Option<String> = connection
            .query_row(
                "SELECT matrix_views_json FROM project_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("Could not read matrices: {error}"))?;
        if let Some(encoded) = encoded {
            let views: Value = serde_json::from_str(&encoded)
                .map_err(|error| format!("Invalid matrix JSON: {error}"))?;
            validate_matrix_views(&views)?;
            state["matrixViews"] = views;
        }
    }
    Ok(state)
}

fn with_temporary_database<T>(
    operation: impl FnOnce(&PathBuf) -> Result<T, String>,
) -> Result<T, String> {
    let path = temporary_database_path()?;
    let result = operation(&path);
    let _ = fs::remove_file(path);
    result
}

#[tauri::command]
pub async fn encode_project_database(state: Value) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_temporary_database(|path| {
            encode_to_path(&state, path)?;
            fs::read(path).map_err(|error| format!("Could not read the project database: {error}"))
        })
    })
    .await
    .map_err(|error| format!("Project database encoding did not complete: {error}"))?
}

#[tauri::command]
pub async fn decode_project_database(data: Vec<u8>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_temporary_database(|path| {
            fs::write(path, data)
                .map_err(|error| format!("Could not stage the project database: {error}"))?;
            decode_from_path(path)
        })
    })
    .await
    .map_err(|error| format!("Project database decoding did not complete: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{decode_from_path, encode_to_path, temporary_database_path};
    use serde_json::json;

    #[test]
    fn app08_matrix_views_malformed_input_stops_before_writing() {
        let path = temporary_database_path().unwrap();
        let error = encode_to_path(&json!({"matrixViews": [{"id":"matrix.qa"}]}), &path)
            .expect_err("nonempty unsupported matrix views must stop before writing");
        assert!(error.contains("missing string field"));
        assert!(!path.exists());
    }
    use std::fs;

    #[test]
    fn numeric_presentation_sqlite_roundtrip() {
        if std::env::var("BIOFIGURESTAT_NUMERIC_PRESENTATION_QA").as_deref() != Ok("1") {
            return;
        }
        let qa = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../ui/.numeric-presentation-qa");
        let mut state: serde_json::Value =
            serde_json::from_slice(&fs::read(qa.join("state.json")).unwrap()).unwrap();
        if state["matrixViews"].as_array().is_some_and(|views| views.is_empty()) {
            state.as_object_mut().unwrap().remove("matrixViews");
        }
        assert_eq!(
            state["adaptiveInput"]["numericPresentation"]["schemaVersion"],
            "0.1.0"
        );
        assert!(state["adaptiveInput"]["numericPresentation"]["displayTexts"]
            .as_object().unwrap().values().any(|value| value == "1.000"));
        let path = qa.join("numeric-presentation.sqlite");
        encode_to_path(&state, &path).unwrap();
        let reopened = decode_from_path(&path).unwrap();
        assert_eq!(
            state, reopened,
            "production SQLite must retain display text and complete canonical/history state"
        );
        fs::write(
            qa.join("native-reopened-state.json"),
            serde_json::to_vec_pretty(&reopened).unwrap(),
        ).unwrap();
    }

    #[test]
    fn app08_r3_legacy_versions_and_corrupt_matrix_are_read_only() {
        let qa = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
            "../../ui/.app-mission08/compat-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&qa).unwrap();
        let state = json!({
            "schemaVersion":"0.3.0", "metadata":{"projectId":"anonymous.compatibility","projectName":"Anonymous QA"},
            "designRevisions":[{"id":"design.1","previousRevisionId":null,"createdAt":"2026-10-09T00:00:00Z"}], "activeDesignRevisionId":"design.1",
            "rawRevisions":[{"id":"raw.1","previousRevisionId":null,"createdAt":"2026-10-09T00:00:00Z"}], "activeRawRevisionId":"raw.1",
            "unitInstances":[],"observations":[],"transformations":[],"derivedDatasetRevisions":[],"derivedValues":[],"analysisRuns":[],"graphs":[],"experimentWorkspace":null,"adaptiveInput":null,"provenanceEvents":[]
        });
        for version in 1..=4 {
            let path = qa.join(format!("legacy-v{version}.sqlite"));
            encode_to_path(&state, &path).unwrap();
            let connection = rusqlite::Connection::open(&path).unwrap();
            if version < 4 {
                connection
                    .execute_batch("ALTER TABLE project_state DROP COLUMN adaptive_input_json;")
                    .unwrap();
            }
            if version < 3 {
                connection
                    .execute_batch(
                        "ALTER TABLE project_state DROP COLUMN experiment_workspace_json;",
                    )
                    .unwrap();
            }
            if version < 2 {
                connection.execute_batch("DROP TABLE derived_values; DROP TABLE derived_dataset_revisions; DROP TABLE transformations;").unwrap();
            }
            connection
                .execute_batch(&format!("PRAGMA user_version = {version};"))
                .unwrap();
            connection.close().unwrap();
            let before = fs::read(&path).unwrap();
            assert_eq!(decode_from_path(&path).unwrap(), state);
            assert_eq!(
                fs::read(&path).unwrap(),
                before,
                "legacy read must not migrate bytes"
            );
        }
        let path = qa.join("corruption-v5.sqlite");
        let mut empty = state.clone();
        empty["matrixViews"] = json!([]);
        encode_to_path(&empty, &path).unwrap();
        assert_eq!(decode_from_path(&path).unwrap(), empty);
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute(
                "UPDATE project_state SET matrix_views_json = ?1",
                ["not-json"],
            )
            .unwrap();
        connection.close().unwrap();
        let before = fs::read(&path).unwrap();
        assert!(decode_from_path(&path)
            .unwrap_err()
            .contains("Invalid matrix JSON"));
        assert_eq!(fs::read(&path).unwrap(), before);
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        connection.close().unwrap();
        let before = fs::read(&path).unwrap();
        assert!(decode_from_path(&path)
            .unwrap_err()
            .contains("Unsupported project database version 99"));
        assert_eq!(fs::read(&path).unwrap(), before);
        println!(
            "APP08 R3 old v1-4 byte-invariant reads and corrupt/unknown version safety PASS: {}",
            qa.display()
        );
    }

    #[test]
    fn sqlite_state_round_trip_preserves_relational_records() {
        let state = json!({
            "schemaVersion": "0.3.0",
            "metadata": {"projectId": "project.test", "projectName": "Test"},
            "designRevisions": [{"id":"design-revision.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeDesignRevisionId": "design-revision.1",
            "rawRevisions": [{"id":"raw.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeRawRevisionId": "raw.1",
            "unitInstances": [{"id":"unit.1","levelId":"level.1","parentUnitId":null}],
            "observations": [{"id":"observation.1","rawRevisionId":"raw.1","unitInstanceId":"unit.1","conditionId":"condition.1","outcomeId":"outcome.1"}],
            "transformations": [{"id":"transformation.d10.1","version":"0.2.0","method":"replicate_summary","inputRevisionIds":["raw.1"]}],
            "derivedDatasetRevisions": [{"id":"derived.1","sourceRawRevisionId":"raw.1","transformationId":"transformation.d10.1","state":"current"}],
            "derivedValues": [{"id":"derived-value.1","derivedDatasetRevisionId":"derived.1","experimentalUnitId":"unit.1","conditionId":"condition.1","outcomeId":"outcome.1","value":12.5,"sourceObservationIds":["observation.1"]}],
            "analysisRuns": [{"id":"analysis-run.1","inputDesignRevisionId":"design-revision.1","inputRawRevisionId":"raw.1","state":"current"}],
            "graphs": [{"id":"graph.1","sourceAnalysisRunId":"analysis-run.1","state":"current"}],
            "experimentWorkspace": {
                "version": "0.1.0",
                "context": "cell_culture",
                "conditionAttributes": [{"id":"attribute.1","label":"Condition"}],
                "conditions": [
                    {"id":"condition.1","label":"Control","attributes":{"attribute.1":"Control"}},
                    {"id":"condition.2","label":"Treatment","attributes":{"attribute.1":"Treatment"}}
                ],
                "timePlan": {"sampling":"none","unit":"h","points":[]},
                "experimentSessions": [{
                    "id":"experiment.1",
                    "label":"Mouse 4",
                    "sessionId":"session.exp-2",
                    "stableUnitId":"unit.mouse-4",
                    "date":"2026-08-20",
                    "note":""
                }],
                "importProvenance": {
                    "sourceLabel":"source.tsv",
                    "importedAt":"2026-08-20T00:00:00Z",
                    "headers":["Session","Unit","Condition","Value"],
                    "sourceRows":[["Exp 2","Mouse 4","Treatment","12.5"]],
                    "mapping":{"sessionColumn":0,"unitColumn":1,"conditionColumn":2,"valueColumn":3},
                    "excludedRowNumbers":[],
                    "duplicateDecision":"none",
                    "transformations":["numeric value parse; source retained"]
                },
                "entrySourceHistory": {
                    "schemaVersion": "0.1.0",
                    "entries": [{
                        "id": "entry-source.visualization.test.revision.2",
                        "kind": "unresolved_visualization_promotion",
                        "capturedAt": "2026-08-20T00:30:00Z",
                        "sourceState": {
                            "projectKind": "unresolved_visualization",
                            "schemaVersion": "0.2.0",
                            "activeDataRevisionId": "revision.2",
                            "activeGraphId": "graph.current",
                            "dataRevisions": [{"id":"revision.1"},{"id":"revision.2"}],
                            "graphSpecs": [{"id":"graph.old"},{"id":"graph.current"}]
                        },
                        "promotion": {
                            "sourceActiveDataRevisionId": "revision.2",
                            "sourceActiveGraphId": "graph.current",
                            "promotedWorkspaceGraphId": "graph.current"
                        }
                    }]
                },
                "graphs": []
            },
            "adaptiveInput": {
                "schemaVersion": "0.1.0",
                "contract": {"contractId":"case-5","experimentName":"Animal survival"},
                "mapping": {"sourceLabel":"case-5.tsv"},
                "rawLineage": {"sourceKind":"tsv","rawText":"MouseID\\tTreatment\\tfollow_up\\tevent_observed"},
                "canonicalObservations": [{"observationId":"adaptive.case-5.1"}],
                "equivalence": {"status":"equivalent"}
            },
            "provenanceEvents": [{"id":"event.1","kind":"project_created","targetId":"project.test","occurredAt":"2026-08-20T00:00:00Z"}]
        });
        let path = temporary_database_path().expect("temporary path");
        encode_to_path(&state, &path).expect("encode state");
        let decoded = decode_from_path(&path).expect("decode state");
        assert_eq!(decoded, state);
        fs::remove_file(path).expect("remove database");
    }

    #[test]
    fn unknown_database_version_is_rejected_without_migration() {
        let state = json!({
            "schemaVersion": "0.2.0",
            "metadata": {"projectId": "project.test", "projectName": "Test"},
            "designRevisions": [{"id":"design-revision.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeDesignRevisionId": "design-revision.1",
            "rawRevisions": [{"id":"raw.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeRawRevisionId": "raw.1",
            "unitInstances": [],
            "observations": [],
            "transformations": [],
            "derivedDatasetRevisions": [],
            "derivedValues": [],
            "analysisRuns": [],
            "graphs": [],
            "experimentWorkspace": null,
            "adaptiveInput": null,
            "provenanceEvents": [{"id":"event.1","kind":"project_created","targetId":"project.test","occurredAt":"2026-08-20T00:00:00Z"}]
        });
        let path = temporary_database_path().expect("temporary path");
        encode_to_path(&state, &path).expect("encode state");
        let connection = rusqlite::Connection::open(&path).expect("open database");
        connection
            .execute_batch("PRAGMA user_version = 99;")
            .expect("change database version");
        connection.close().expect("close database");

        let error = decode_from_path(&path).expect_err("unknown version must stop opening");
        assert!(error.contains("Unsupported project database version 99"));
        fs::remove_file(path).expect("remove database");
    }

    #[test]
    fn version_one_database_opens_with_empty_derived_collections() {
        let state = json!({
            "schemaVersion": "0.2.0",
            "metadata": {"projectId": "project.v1", "projectName": "Legacy"},
            "designRevisions": [{"id":"design-revision.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeDesignRevisionId": "design-revision.1",
            "rawRevisions": [{"id":"raw.1","previousRevisionId":null,"createdAt":"2026-08-20T00:00:00Z"}],
            "activeRawRevisionId": "raw.1",
            "unitInstances": [],
            "observations": [],
            "transformations": [],
            "derivedDatasetRevisions": [],
            "derivedValues": [],
            "analysisRuns": [],
            "graphs": [],
            "experimentWorkspace": null,
            "adaptiveInput": null,
            "provenanceEvents": [{"id":"event.1","kind":"project_created","targetId":"project.v1","occurredAt":"2026-08-20T00:00:00Z"}]
        });
        let path = temporary_database_path().expect("temporary path");
        encode_to_path(&state, &path).expect("encode current database");
        let connection = rusqlite::Connection::open(&path).expect("open database");
        connection
            .execute_batch(
                "DROP TABLE derived_values;
                 DROP TABLE derived_dataset_revisions;
                 DROP TABLE transformations;
                 PRAGMA user_version = 1;",
            )
            .expect("downgrade fixture to the legacy table set");
        connection.close().expect("close database");

        let decoded = decode_from_path(&path).expect("decode version one database");
        assert_eq!(decoded, state);
        fs::remove_file(path).expect("remove database");
    }
}
