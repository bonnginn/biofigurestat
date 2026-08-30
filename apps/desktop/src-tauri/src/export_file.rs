use std::{
    fs::OpenOptions,
    io::Write,
    path::Path,
};

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const ALLOWED_EXPORT_EXTENSIONS: [&str; 5] = ["svg", "png", "csv", "txt", "json"];

#[tauri::command]
pub fn write_export_file(target: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&target);
    if !path.is_absolute() {
        return Err("Export target must be an absolute path.".to_owned());
    }
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("Export payload exceeds the 64 MB limit.".to_owned());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Export target must have a supported file extension.".to_owned())?;
    if !ALLOWED_EXPORT_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Unsupported export extension: {extension}"));
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)
        .map_err(|error| format!("Could not create export file: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("Could not write export file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not finish export file: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_and_unknown_targets() {
        assert!(write_export_file("figure.svg".to_owned(), b"<svg/>".to_vec()).is_err());
        let target = std::env::temp_dir().join("lsaa-export-test.exe");
        assert!(write_export_file(target.to_string_lossy().into_owned(), vec![]).is_err());
    }

    #[test]
    fn writes_supported_export() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let target = std::env::temp_dir().join(format!(
            "lsaa-export-{}-{}.svg",
            std::process::id(),
            unique
        ));
        write_export_file(target.to_string_lossy().into_owned(), b"<svg/>".to_vec()).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"<svg/>");
        let _ = std::fs::remove_file(target);
    }
}
