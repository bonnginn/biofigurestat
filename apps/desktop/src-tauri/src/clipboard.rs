#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(target_os = "windows")]
use std::{ffi::c_void, ptr};
use std::io::Cursor;

fn png_to_windows_dib(png_bytes: &[u8]) -> Result<Vec<u8>, String> {
    const BITMAP_INFO_HEADER_SIZE: usize = 40;

    let mut decoder = png::Decoder::new(Cursor::new(png_bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
    let mut decoded = vec![0; reader.output_buffer_size()];
    let output = reader
        .next_frame(&mut decoded)
        .map_err(|error| error.to_string())?;
    let width = usize::try_from(output.width).map_err(|error| error.to_string())?;
    let height = usize::try_from(output.height).map_err(|error| error.to_string())?;
    if width == 0 || height == 0 {
        return Err("Graph PNG has no pixels".to_string());
    }

    let rgba = match output.color_type {
        png::ColorType::Rgba => decoded[..output.buffer_size()].to_vec(),
        png::ColorType::Rgb => decoded[..output.buffer_size()]
            .chunks_exact(3)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => decoded[..output.buffer_size()]
            .chunks_exact(2)
            .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
            .collect(),
        png::ColorType::Grayscale => decoded[..output.buffer_size()]
            .iter()
            .flat_map(|value| [*value, *value, *value, 255])
            .collect(),
        png::ColorType::Indexed => {
            return Err("Graph PNG palette could not be expanded".to_string());
        }
    };

    let image_size = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "Graph PNG is too large for the Windows clipboard".to_string())?;
    let mut dib = Vec::with_capacity(BITMAP_INFO_HEADER_SIZE + image_size);
    dib.extend_from_slice(&(BITMAP_INFO_HEADER_SIZE as u32).to_le_bytes());
    dib.extend_from_slice(&(output.width as i32).to_le_bytes());
    // A positive height declares bottom-up rows, which is supported by the
    // broadest range of Windows clipboard consumers.
    dib.extend_from_slice(&(output.height as i32).to_le_bytes());
    dib.extend_from_slice(&1_u16.to_le_bytes());
    dib.extend_from_slice(&32_u16.to_le_bytes());
    dib.extend_from_slice(&0_u32.to_le_bytes()); // BI_RGB
    dib.extend_from_slice(&(image_size as u32).to_le_bytes());
    dib.extend_from_slice(&0_i32.to_le_bytes());
    dib.extend_from_slice(&0_i32.to_le_bytes());
    dib.extend_from_slice(&0_u32.to_le_bytes());
    dib.extend_from_slice(&0_u32.to_le_bytes());

    for row in rgba.chunks_exact(width * 4).rev() {
        for pixel in row.chunks_exact(4) {
            dib.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
    }
    Ok(dib)
}

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
    const CF_DIB: u32 = 8;

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
    let dib_bytes = png_to_windows_dib(png_bytes)?;
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
            let set_bytes = |clipboard_format: u32, bytes: &[u8]| -> Result<(), String> {
                let memory = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
                if memory.is_null() {
                    return Err("Could not allocate Windows clipboard memory".to_string());
                }
                let destination = GlobalLock(memory);
                if destination.is_null() {
                    let _ = GlobalFree(memory);
                    return Err("Could not lock Windows clipboard memory".to_string());
                }
                ptr::copy_nonoverlapping(bytes.as_ptr(), destination.cast::<u8>(), bytes.len());
                let _ = GlobalUnlock(memory);
                if SetClipboardData(clipboard_format, memory).is_null() {
                    let _ = GlobalFree(memory);
                    return Err("Could not place Graph data on the Windows clipboard".to_string());
                }
                // Ownership transfers to the clipboard after SetClipboardData succeeds.
                Ok(())
            };
            set_bytes(format, png_bytes)?;
            set_bytes(CF_DIB, &dib_bytes)?;
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

#[cfg(test)]
mod tests {
    use super::png_to_windows_dib;

    #[test]
    fn converts_png_to_bottom_up_bgra_dib() {
        let mut png_bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png_bytes, 1, 2);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().expect("PNG header");
            writer
                .write_image_data(&[255, 0, 0, 255, 0, 0, 255, 128])
                .expect("PNG pixels");
        }

        let dib = png_to_windows_dib(&png_bytes).expect("DIB");
        assert_eq!(&dib[0..4], &40_u32.to_le_bytes());
        assert_eq!(&dib[4..8], &1_i32.to_le_bytes());
        assert_eq!(&dib[8..12], &2_i32.to_le_bytes());
        assert_eq!(&dib[14..16], &32_u16.to_le_bytes());
        assert_eq!(&dib[40..44], &[255, 0, 0, 128]);
        assert_eq!(&dib[44..48], &[0, 0, 255, 255]);
    }
}
