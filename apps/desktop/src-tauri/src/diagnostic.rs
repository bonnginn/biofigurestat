use std::path::Path;

const MAX_DIAGNOSTIC_BYTES: usize = 1_000_000;

fn validate_target(target: &str, content: &str) -> Result<(), String> {
    if content.len() > MAX_DIAGNOSTIC_BYTES {
        return Err("Diagnostic report exceeds the 1 MB safety limit".to_string());
    }
    let path = Path::new(target);
    if !path.is_absolute() {
        return Err("Diagnostic report target must be an absolute user-selected path".to_string());
    }
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err("Diagnostic report target must use the .json extension".to_string());
    }
    serde_json::from_str::<serde_json::Value>(content)
        .map_err(|_| "Diagnostic report content must be valid JSON".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn write_diagnostic_report(target: String, content: String) -> Result<(), String> {
    validate_target(&target, &content)?;
    std::fs::write(target, content)
        .map_err(|error| format!("Could not write the diagnostic report: {error}"))
}

#[cfg(test)]
mod tests {
    use super::validate_target;

    #[test]
    fn accepts_only_small_json_reports_at_absolute_json_targets() {
        let target = if cfg!(target_os = "windows") {
            r"C:\temp\diagnostic.json"
        } else {
            "/tmp/diagnostic.json"
        };
        assert!(validate_target(target, r#"{"schemaVersion":"1.0.0"}"#).is_ok());
        assert!(validate_target("relative.json", "{}").is_err());
        assert!(validate_target(target, "not-json").is_err());
    }
}
