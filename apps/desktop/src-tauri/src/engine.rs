use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

enum EngineLaunch {
    PythonModule { python: PathBuf },
    PackagedBinary { executable: PathBuf },
}

fn resolve_engine(app: &AppHandle) -> Result<EngineLaunch, String> {
    if cfg!(debug_assertions) {
        let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .ok_or_else(|| "Could not resolve the development repository root".to_string())?
            .to_path_buf();
        let python = if cfg!(target_os = "windows") {
            repository_root.join("engine/python/.venv/Scripts/python.exe")
        } else {
            repository_root.join("engine/python/.venv/bin/python")
        };
        if !python.is_file() {
            return Err(
                "The pinned development analysis environment is missing. Install engine/python before running analysis."
                    .to_string(),
            );
        }
        return Ok(EngineLaunch::PythonModule { python });
    }

    let executable_name = if cfg!(target_os = "windows") {
        "lsaa-engine.exe"
    } else {
        "lsaa-engine"
    };
    let executable = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not resolve application resources: {error}"))?
        .join("engine")
        .join(executable_name);
    if !executable.is_file() {
        return Err(
            "The packaged analysis engine is missing from application resources".to_string(),
        );
    }
    Ok(EngineLaunch::PackagedBinary { executable })
}

fn execute_engine_process(launch: EngineLaunch, request: Value) -> Result<Value, String> {
    let mut command = match launch {
        EngineLaunch::PythonModule { python } => {
            let mut command = Command::new(python);
            command.args(["-m", "lsaa_engine.cli"]);
            command
        }
        EngineLaunch::PackagedBinary { executable } => Command::new(executable),
    };
    // The engine is a pipe-driven helper, not a user-facing console program. On Windows a
    // console-subsystem PyInstaller executable otherwise flashes or leaves a command window open
    // each time Statistics runs. CREATE_NO_WINDOW keeps stdin/stdout/stderr redirection intact.
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the local analysis engine: {error}"))?;

    let encoded = serde_json::to_vec(&request)
        .map_err(|error| format!("Could not encode the analysis request: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Analysis engine input stream is unavailable".to_string())?
        .write_all(&encoded)
        .map_err(|error| format!("Could not send the request to the analysis engine: {error}"))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Could not wait for the analysis engine: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "The local analysis engine failed: {}",
            detail.trim()
        ));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("The analysis engine returned invalid JSON: {error}"))
}

fn execute_engine(app: AppHandle, request: Value) -> Result<Value, String> {
    execute_engine_process(resolve_engine(&app)?, request)
}

#[tauri::command]
pub async fn run_analysis(app: AppHandle, request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || execute_engine(app, request))
        .await
        .map_err(|error| format!("The analysis task could not complete: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{execute_engine_process, EngineLaunch};
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    #[ignore = "requires the pinned engine/python development environment"]
    fn development_python_round_trip_returns_versioned_json() {
        let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .expect("repository root")
            .to_path_buf();
        let engine_version_source = std::fs::read_to_string(
            repository_root.join("engine/python/lsaa_engine/__init__.py"),
        )
        .expect("read authoritative engine version");
        let expected_engine_version = engine_version_source
            .lines()
            .find_map(|line| {
                line.strip_prefix("ENGINE_VERSION = \"")
                    .and_then(|value| value.strip_suffix('"'))
            })
            .expect("authoritative engine version");
        let python = if cfg!(target_os = "windows") {
            repository_root.join("engine/python/.venv/Scripts/python.exe")
        } else {
            repository_root.join("engine/python/.venv/bin/python")
        };
        let request = json!({
            "protocolVersion": "0.1.0",
            "requestId": "request.rust-round-trip",
            "projectId": "project.rust-round-trip",
            "analysisId": "analysis.rust-round-trip",
            "templateId": "D01",
            "templateVersion": "0.1.0",
            "method": "welch_t",
            "contrastConditionIds": ["condition.a", "condition.b"],
            "observations": [
                {"observationId": "a.1", "conditionId": "condition.a", "value": 1.0, "experimentalUnitId": "unit.a.1"},
                {"observationId": "a.2", "conditionId": "condition.a", "value": 2.0, "experimentalUnitId": "unit.a.2"},
                {"observationId": "b.1", "conditionId": "condition.b", "value": 3.0, "experimentalUnitId": "unit.b.1"},
                {"observationId": "b.2", "conditionId": "condition.b", "value": 5.0, "experimentalUnitId": "unit.b.2"}
            ],
            "options": {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": null}
        });

        let result = execute_engine_process(EngineLaunch::PythonModule { python }, request)
            .expect("engine round trip");
        assert_eq!(result["protocolVersion"], "0.1.0");
        assert_eq!(result["requestId"], "request.rust-round-trip");
        assert_eq!(result["status"], "ok");
        assert_eq!(result["engine"]["version"], expected_engine_version);
        assert_eq!(result["engine"]["packages"]["scipy"], "1.18.0");

        let d03_request = json!({
            "protocolVersion": "0.2.0",
            "requestId": "request.rust-d03-round-trip",
            "projectId": "project.rust-round-trip",
            "analysisId": "analysis.rust-d03-round-trip",
            "templateId": "D03",
            "templateVersion": "0.1.0",
            "method": "welch_anova",
            "conditionIds": ["condition.a", "condition.b", "condition.c"],
            "contrastIntent": "all_pairs",
            "primaryContrastConditionIds": ["condition.a", "condition.c"],
            "observations": [
                {"observationId": "a.1", "conditionId": "condition.a", "value": 1.0, "experimentalUnitId": "unit.a.1"},
                {"observationId": "a.2", "conditionId": "condition.a", "value": 2.0, "experimentalUnitId": "unit.a.2"},
                {"observationId": "a.3", "conditionId": "condition.a", "value": 4.0, "experimentalUnitId": "unit.a.3"},
                {"observationId": "b.1", "conditionId": "condition.b", "value": 3.0, "experimentalUnitId": "unit.b.1"},
                {"observationId": "b.2", "conditionId": "condition.b", "value": 5.0, "experimentalUnitId": "unit.b.2"},
                {"observationId": "b.3", "conditionId": "condition.b", "value": 8.0, "experimentalUnitId": "unit.b.3"},
                {"observationId": "c.1", "conditionId": "condition.c", "value": 7.0, "experimentalUnitId": "unit.c.1"},
                {"observationId": "c.2", "conditionId": "condition.c", "value": 9.0, "experimentalUnitId": "unit.c.2"},
                {"observationId": "c.3", "conditionId": "condition.c", "value": 12.0, "experimentalUnitId": "unit.c.3"}
            ],
            "options": {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": "games_howell_all_pairs"}
        });
        let d03_result = execute_engine_process(
            EngineLaunch::PythonModule {
                python: if cfg!(target_os = "windows") {
                    repository_root.join("engine/python/.venv/Scripts/python.exe")
                } else {
                    repository_root.join("engine/python/.venv/bin/python")
                },
            },
            d03_request,
        )
        .expect("D03 engine round trip");
        assert_eq!(d03_result["protocolVersion"], "0.2.0");
        assert_eq!(d03_result["status"], "ok");
        assert_eq!(d03_result["tests"].as_array().map(Vec::len), Some(4));

        let d04_request = serde_json::json!({
            "protocolVersion": "0.3.0",
            "requestId": "request.rust-d04-round-trip",
            "projectId": "project.rust-round-trip",
            "analysisId": "analysis.rust-d04-round-trip",
            "templateId": "D04",
            "templateVersion": "0.1.0",
            "method": "repeated_measures_anova",
            "conditionIds": ["condition.before", "condition.middle", "condition.after"],
            "primaryContrastConditionIds": ["condition.before", "condition.after"],
            "observations": [
                {"observationId": "u1.a", "conditionId": "condition.before", "value": 1.0, "experimentalUnitId": "unit.1", "pairId": "pair.1"},
                {"observationId": "u1.b", "conditionId": "condition.middle", "value": 2.0, "experimentalUnitId": "unit.1", "pairId": "pair.1"},
                {"observationId": "u1.c", "conditionId": "condition.after", "value": 5.0, "experimentalUnitId": "unit.1", "pairId": "pair.1"},
                {"observationId": "u2.a", "conditionId": "condition.before", "value": 2.0, "experimentalUnitId": "unit.2", "pairId": "pair.2"},
                {"observationId": "u2.b", "conditionId": "condition.middle", "value": 4.0, "experimentalUnitId": "unit.2", "pairId": "pair.2"},
                {"observationId": "u2.c", "conditionId": "condition.after", "value": 5.5, "experimentalUnitId": "unit.2", "pairId": "pair.2"},
                {"observationId": "u3.a", "conditionId": "condition.before", "value": 4.0, "experimentalUnitId": "unit.3", "pairId": "pair.3"},
                {"observationId": "u3.b", "conditionId": "condition.middle", "value": 3.0, "experimentalUnitId": "unit.3", "pairId": "pair.3"},
                {"observationId": "u3.c", "conditionId": "condition.after", "value": 7.0, "experimentalUnitId": "unit.3", "pairId": "pair.3"}
            ],
            "options": {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": "holm_paired_all_pairs"}
        });
        let d04_result = execute_engine_process(
            EngineLaunch::PythonModule {
                python: if cfg!(target_os = "windows") {
                    repository_root.join("engine/python/.venv/Scripts/python.exe")
                } else {
                    repository_root.join("engine/python/.venv/bin/python")
                },
            },
            d04_request,
        )
        .expect("D04 engine round trip");
        assert_eq!(d04_result["protocolVersion"], "0.3.0");
        assert_eq!(d04_result["status"], "ok");
        assert_eq!(d04_result["tests"].as_array().map(Vec::len), Some(4));
    }
}
