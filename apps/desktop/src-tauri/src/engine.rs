use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const ANALYSIS_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Default)]
pub struct EngineProcessRegistry {
    active: Arc<Mutex<HashMap<String, Arc<ActiveEngineProcess>>>>,
}

struct ActiveEngineProcess {
    child: Mutex<Child>,
    cancelled: AtomicBool,
}

enum EngineWaitOutcome {
    Completed(ExitStatus),
    Cancelled,
    TimedOut,
}

enum EngineLaunch {
    PythonModule { python: PathBuf },
    PackagedBinary { executable: PathBuf },
}

fn wait_for_engine_process(
    active: &ActiveEngineProcess,
    timeout: Duration,
) -> Result<EngineWaitOutcome, String> {
    let started = Instant::now();
    loop {
        let status = active
            .child
            .lock()
            .map_err(|_| "ENGINE_PROCESS_STATE_UNAVAILABLE".to_string())?
            .try_wait()
            .map_err(|error| format!("ENGINE_PROCESS_WAIT_FAILED: {error}"))?;
        match status {
            Some(_) if active.cancelled.load(Ordering::SeqCst) => {
                return Ok(EngineWaitOutcome::Cancelled);
            }
            Some(status) => return Ok(EngineWaitOutcome::Completed(status)),
            None if started.elapsed() < timeout => thread::sleep(Duration::from_millis(20)),
            None => {
                let mut child = active
                    .child
                    .lock()
                    .map_err(|_| "ENGINE_PROCESS_STATE_UNAVAILABLE".to_string())?;
                let _ = child.kill();
                let _ = child.wait();
                return Ok(EngineWaitOutcome::TimedOut);
            }
        }
    }
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

fn execute_engine_process(
    launch: EngineLaunch,
    request: Value,
    registry: &EngineProcessRegistry,
) -> Result<Value, String> {
    let request_id = request
        .get("requestId")
        .and_then(Value::as_str)
        .ok_or_else(|| "ENGINE_REQUEST_ID_MISSING".to_string())?
        .to_string();
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

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Analysis engine output stream is unavailable".to_string())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Analysis engine error stream is unavailable".to_string())?;
    let stdout_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).map(|_| bytes)
    });
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).map(|_| bytes)
    });
    let active = Arc::new(ActiveEngineProcess {
        child: Mutex::new(child),
        cancelled: AtomicBool::new(false),
    });
    registry
        .active
        .lock()
        .map_err(|_| "ENGINE_PROCESS_STATE_UNAVAILABLE".to_string())?
        .insert(request_id.clone(), Arc::clone(&active));

    let outcome = wait_for_engine_process(&active, ANALYSIS_TIMEOUT);
    if outcome.is_err() {
        if let Ok(mut child) = active.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut processes) = registry.active.lock() {
        processes.remove(&request_id);
    }
    let stdout = stdout_reader
        .join()
        .map_err(|_| "ENGINE_OUTPUT_READER_FAILED".to_string())?
        .map_err(|error| format!("ENGINE_OUTPUT_READ_FAILED: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "ENGINE_ERROR_READER_FAILED".to_string())?
        .map_err(|error| format!("ENGINE_ERROR_READ_FAILED: {error}"))?;

    let status = match outcome? {
        EngineWaitOutcome::Completed(status) => status,
        EngineWaitOutcome::Cancelled => return Err("ENGINE_PROCESS_CANCELLED".to_string()),
        EngineWaitOutcome::TimedOut => return Err("ENGINE_PROCESS_TIMEOUT".to_string()),
    };
    if !status.success() {
        let detail = String::from_utf8_lossy(&stderr);
        return Err(format!(
            "The local analysis engine failed: {}",
            detail.trim()
        ));
    }
    serde_json::from_slice(&stdout).map_err(|error| {
        let category = if stdout.is_empty() {
            "empty"
        } else if stdout.starts_with(&[0xef, 0xbb, 0xbf]) {
            "utf8_bom"
        } else if stdout.windows(3).any(|bytes| bytes == b"NaN")
            || stdout.windows(8).any(|bytes| bytes == b"Infinity")
        {
            "non_finite"
        } else {
            match error.classify() {
                serde_json::error::Category::Io => "io",
                serde_json::error::Category::Syntax => "syntax",
                serde_json::error::Category::Data => "data",
                serde_json::error::Category::Eof => "eof",
            }
        };
        let starts_with_object = stdout
            .iter()
            .find(|byte| !byte.is_ascii_whitespace())
            .is_some_and(|byte| *byte == b'{');
        let ends_with_object = stdout
            .iter()
            .rev()
            .find(|byte| !byte.is_ascii_whitespace())
            .is_some_and(|byte| *byte == b'}');
        format!(
            "ENGINE_OUTPUT_INVALID_JSON:{category}:bytes={}:starts_object={starts_with_object}:ends_object={ends_with_object}",
            stdout.len()
        )
    })
}

fn execute_engine(
    app: AppHandle,
    request: Value,
    registry: &EngineProcessRegistry,
) -> Result<Value, String> {
    execute_engine_process(resolve_engine(&app)?, request, registry)
}

#[tauri::command]
pub async fn run_analysis(
    app: AppHandle,
    request: Value,
    registry: State<'_, EngineProcessRegistry>,
) -> Result<Value, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || execute_engine(app, request, &registry))
        .await
        .map_err(|error| format!("The analysis task could not complete: {error}"))?
}

#[tauri::command]
pub fn cancel_analysis(
    request_id: String,
    registry: State<'_, EngineProcessRegistry>,
) -> Result<bool, String> {
    let active = registry
        .active
        .lock()
        .map_err(|_| "ENGINE_PROCESS_STATE_UNAVAILABLE".to_string())?
        .get(&request_id)
        .cloned();
    let Some(active) = active else {
        return Ok(false);
    };
    active.cancelled.store(true, Ordering::SeqCst);
    let mut child = active
        .child
        .lock()
        .map_err(|_| "ENGINE_PROCESS_STATE_UNAVAILABLE".to_string())?;
    match child.kill() {
        Ok(()) => Ok(true),
        Err(_) if child.try_wait().ok().flatten().is_some() => Ok(false),
        Err(error) => Err(format!("ENGINE_PROCESS_CANCEL_FAILED: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        execute_engine_process, wait_for_engine_process, ActiveEngineProcess, EngineLaunch,
        EngineProcessRegistry, EngineWaitOutcome,
    };
    use serde_json::json;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    };
    use std::time::Duration;

    #[test]
    fn timeout_terminates_an_unresponsive_process() {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping 127.0.0.1 -n 6 >NUL"]);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 5"]);
            command
        };
        let child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn timeout fixture");

        let active = ActiveEngineProcess {
            child: Mutex::new(child),
            cancelled: AtomicBool::new(false),
        };
        let outcome = wait_for_engine_process(&active, Duration::from_millis(20))
            .expect("fixture wait should be handled");
        assert!(matches!(outcome, EngineWaitOutcome::TimedOut));
    }

    #[test]
    fn cancellation_terminates_only_the_registered_process() {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping 127.0.0.1 -n 6 >NUL"]);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 5"]);
            command
        };
        let child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn cancellation fixture");
        let active = ActiveEngineProcess {
            child: Mutex::new(child),
            cancelled: AtomicBool::new(false),
        };
        active.cancelled.store(true, Ordering::SeqCst);
        active
            .child
            .lock()
            .expect("lock cancellation fixture")
            .kill()
            .expect("kill cancellation fixture");

        let outcome = wait_for_engine_process(&active, Duration::from_secs(1))
            .expect("cancelled fixture wait should be handled");
        assert!(matches!(outcome, EngineWaitOutcome::Cancelled));
    }

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

        let registry = EngineProcessRegistry::default();
        let result =
            execute_engine_process(EngineLaunch::PythonModule { python }, request, &registry)
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
            &registry,
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
            &registry,
        )
        .expect("D04 engine round trip");
        assert_eq!(d04_result["protocolVersion"], "0.3.0");
        assert_eq!(d04_result["status"], "ok");
        assert_eq!(d04_result["tests"].as_array().map(Vec::len), Some(4));
    }

    #[test]
    #[ignore = "requires the locally built packaged Windows engine"]
    #[cfg(target_os = "windows")]
    fn packaged_windows_engine_round_trip_returns_welch_tost_json() {
        let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(3)
            .expect("repository root")
            .to_path_buf();
        let executable = repository_root.join(
            "engine/python/dist/windows-amd64/lsaa-engine.exe/lsaa-engine.exe",
        );
        assert!(executable.is_file(), "build the packaged Windows engine first");
        let request: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../engine/python/smoke_fixtures/welch-tost-equivalence-supported-request.json"
        ))
        .expect("shared Welch TOST boundary fixture");

        let result = execute_engine_process(
            EngineLaunch::PackagedBinary { executable },
            request,
            &EngineProcessRegistry::default(),
        )
        .expect("packaged Welch TOST round trip");
        assert_eq!(result["protocolVersion"], "0.15.0");
        assert_eq!(result["status"], "ok");
        assert_eq!(
            result["equivalence"]["comparisons"][0]["conclusion"],
            "equivalence_supported"
        );
    }
}
