#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub fn copy_graph_png(png_bytes: Vec<u8>) -> Result<(), String> {
    if png_bytes.is_empty() {
        return Err("Graph PNG is empty".to_string());
    }
    copy_png_to_system_clipboard(&png_bytes)
}

#[cfg(target_os = "macos")]
fn copy_png_to_system_clipboard(png_bytes: &[u8]) -> Result<(), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let path = std::env::temp_dir().join(format!("lsaa-graph-{}-{stamp}.png", std::process::id()));
    fs::write(&path, png_bytes).map_err(|error| error.to_string())?;
    let escaped_path = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script =
        format!("set the clipboard to (read (POSIX file \"{escaped_path}\") as «class PNGf»)");
    let result = Command::new("osascript").args(["-e", &script]).output();
    let _ = fs::remove_file(&path);
    let output = result.map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn copy_png_to_system_clipboard(_png_bytes: &[u8]) -> Result<(), String> {
    Err("Native graph clipboard is not implemented on this platform".to_string())
}
