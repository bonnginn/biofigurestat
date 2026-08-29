#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(target_os = "windows")]
use std::{ffi::c_void, ptr};

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

#[cfg(target_os = "windows")]
fn copy_png_to_system_clipboard(png_bytes: &[u8]) -> Result<(), String> {
    const GMEM_MOVEABLE: u32 = 0x0002;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(owner: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn RegisterClipboardFormatW(format: *const u16) -> u32;
        fn SetClipboardData(format: u32, memory: *mut c_void) -> *mut c_void;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, bytes: usize) -> *mut c_void;
        fn GlobalLock(memory: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(memory: *mut c_void) -> i32;
        fn GlobalFree(memory: *mut c_void) -> *mut c_void;
    }

    let png_format_name = "PNG\0".encode_utf16().collect::<Vec<_>>();
    unsafe {
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("Could not open the Windows clipboard".to_string());
        }

        let result = (|| {
            if EmptyClipboard() == 0 {
                return Err("Could not clear the Windows clipboard".to_string());
            }
            let format = RegisterClipboardFormatW(png_format_name.as_ptr());
            if format == 0 {
                return Err("Could not register the Windows PNG clipboard format".to_string());
            }
            let memory = GlobalAlloc(GMEM_MOVEABLE, png_bytes.len());
            if memory.is_null() {
                return Err("Could not allocate Windows clipboard memory".to_string());
            }
            let destination = GlobalLock(memory);
            if destination.is_null() {
                let _ = GlobalFree(memory);
                return Err("Could not lock Windows clipboard memory".to_string());
            }
            ptr::copy_nonoverlapping(png_bytes.as_ptr(), destination.cast::<u8>(), png_bytes.len());
            let _ = GlobalUnlock(memory);
            if SetClipboardData(format, memory).is_null() {
                let _ = GlobalFree(memory);
                return Err("Could not place PNG data on the Windows clipboard".to_string());
            }
            // Ownership of memory transfers to the clipboard after SetClipboardData succeeds.
            Ok(())
        })();

        let _ = CloseClipboard();
        result
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn copy_png_to_system_clipboard(_png_bytes: &[u8]) -> Result<(), String> {
    Err("Native graph clipboard is not implemented on this platform".to_string())
}
