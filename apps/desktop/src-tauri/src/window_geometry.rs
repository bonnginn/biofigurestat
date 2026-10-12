//! Desktop shell geometry only. Project/data persistence is deliberately separate.
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalSize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
struct Bounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
struct Saved {
    version: u32,
    bounds: Bounds,
    scale: f64,
    maximized: bool,
    #[serde(default)]
    monitor_work: Option<Bounds>,
}

pub struct WindowGeometry {
    path: PathBuf,
    saved: Mutex<Saved>,
    writable: bool,
    ready: AtomicBool,
}

fn fit(work: Bounds, wanted: Bounds) -> Bounds {
    // Restoration preserves edge-aligned user placement; first-run margin comes
    // from its smaller, centered size, not from rewriting every saved rectangle.
    let margin = 0;
    let width = wanted
        .width
        .max(1)
        .min(work.width.saturating_sub(2 * margin).max(1));
    let height = wanted
        .height
        .max(1)
        .min(work.height.saturating_sub(2 * margin).max(1));
    let left = work.x as i64 + margin as i64;
    let top = work.y as i64 + margin as i64;
    Bounds {
        x: (wanted.x as i64).clamp(
            left,
            left + work.width as i64 - 2 * margin as i64 - width as i64,
        ) as i32,
        y: (wanted.y as i64).clamp(
            top,
            top + work.height as i64 - 2 * margin as i64 - height as i64,
        ) as i32,
        width,
        height,
    }
}

fn first_run(work: Bounds) -> Bounds {
    let width = (work.width as f64 * 0.92).round() as u32;
    let height = (work.height as f64 * 0.92).round() as u32;
    fit(
        work,
        Bounds {
            x: work.x + ((work.width - width) / 2) as i32,
            y: work.y + ((work.height - height) / 2) as i32,
            width,
            height,
        },
    )
}

fn overlap(a: Bounds, b: Bounds) -> i64 {
    let w = (a.x as i64 + a.width as i64).min(b.x as i64 + b.width as i64)
        - (a.x as i64).max(b.x as i64);
    let h = (a.y as i64 + a.height as i64).min(b.y as i64 + b.height as i64)
        - (a.y as i64).max(b.y as i64);
    w.max(0) * h.max(0)
}

fn work_bounds(monitor: &tauri::Monitor) -> Bounds {
    let area = monitor.work_area();
    Bounds {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
    }
}

pub fn initialize(app: &tauri::App) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    // Isolate development candidates from the installed app's preferences without
    // inventing another application identifier or clearing any existing state.
    use sha2::{Digest, Sha256};
    let executable = std::env::current_exe()?;
    let key = format!(
        "{:x}",
        Sha256::digest(executable.to_string_lossy().as_bytes())
    );
    let path = app
        .path()
        .app_config_dir()?
        .join(format!("window-geometry-v1-{}.json", &key[..16]));
    let loaded = std::fs::read(&path);
    let writable = match &loaded {
        Ok(bytes) => serde_json::from_slice::<Saved>(bytes).is_ok_and(|s| {
            s.version == 1
                && s.scale.is_finite()
                && s.scale > 0.0
                && s.bounds.width > 0
                && s.bounds.height > 0
        }),
        Err(error) => error.kind() == std::io::ErrorKind::NotFound,
    };
    if !writable {
        // Local runtime diagnostics only: do not expose user paths or overwrite
        // malformed/future preferences to make restoration appear successful.
        match &loaded {
            Err(error) => eprintln!(
                "window geometry: preference read failed ({:?})",
                error.kind()
            ),
            Ok(_) => eprintln!("window geometry: unsupported or invalid preferences preserved"),
        }
    }
    // Malformed/future preferences are preserved, never silently replaced.
    let previous = loaded
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
        .filter(|s| {
            s.version == 1
                && s.scale.is_finite()
                && s.scale > 0.0
                && s.bounds.width > 0
                && s.bounds.height > 0
        });
    let monitors = window.available_monitors()?;
    let selected = previous.and_then(|s| {
        monitors
            .iter()
            .max_by_key(|m| overlap(s.monitor_work.unwrap_or(s.bounds), work_bounds(m)))
            .filter(|m| overlap(s.monitor_work.unwrap_or(s.bounds), work_bounds(m)) > 0)
    });
    let fallback = window.current_monitor()?.or(window.primary_monitor()?);
    let Some(monitor) = selected.or(fallback.as_ref()) else {
        return Ok(());
    };
    let work = work_bounds(monitor);
    if work.width == 0 || work.height == 0 {
        return Ok(());
    }
    let scale = monitor.scale_factor();
    let bounds = previous
        .map(|s| {
            let ratio = scale / s.scale;
            fit(
                work,
                Bounds {
                    x: s.monitor_work
                        .map(|old| work.x.saturating_add(s.bounds.x.saturating_sub(old.x)))
                        .unwrap_or(s.bounds.x),
                    y: s.monitor_work
                        .map(|old| work.y.saturating_add(s.bounds.y.saturating_sub(old.y)))
                        .unwrap_or(s.bounds.y),
                    width: (s.bounds.width as f64 * ratio).round() as u32,
                    height: (s.bounds.height as f64 * ratio).round() as u32,
                },
            )
        })
        .unwrap_or_else(|| first_run(work));
    // Move first so a monitor/DPI transition has occurred before measuring the
    // non-client frame and applying the selected monitor's physical bounds.
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    let frame = window.outer_size()?;
    let client = window.inner_size()?;
    let decoration_width = frame.width.saturating_sub(client.width);
    let decoration_height = frame.height.saturating_sub(client.height);
    // Configured logical minimums cannot force a high-DPI/small-screen window
    // outside the available work area.
    window.set_min_size(Some(LogicalSize::new(
        900.0_f64.min(bounds.width.saturating_sub(decoration_width).max(1) as f64 / scale),
        640.0_f64.min(bounds.height.saturating_sub(decoration_height).max(1) as f64 / scale),
    )))?;
    window.set_size(PhysicalSize::new(
        bounds.width.saturating_sub(decoration_width).max(1),
        bounds.height.saturating_sub(decoration_height).max(1),
    ))?;
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    let saved = Saved {
        version: 1,
        bounds,
        scale,
        maximized: previous.is_some_and(|s| s.maximized),
        monitor_work: Some(work),
    };
    app.manage(WindowGeometry {
        path,
        saved: Mutex::new(saved),
        writable,
        ready: AtomicBool::new(false),
    });
    Ok(())
}

// One coherent physical snapshot. State queries that fail or change while
// measuring are not evidence of a normal frame.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Clone, Copy)]
struct FrameObservation {
    bounds: Bounds,
    scale: f64,
    work: Bounds,
    maximized: bool,
    minimized: bool,
    fullscreen: bool,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn capture_frame(window: &tauri::WebviewWindow) -> Option<FrameObservation> {
    let flags = (
        window.is_maximized().ok()?,
        window.is_minimized().ok()?,
        window.is_fullscreen().ok()?,
    );
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let scale = window.scale_factor().ok()?;
    let monitor = window.current_monitor().ok()??;
    let after = (
        window.is_maximized().ok()?,
        window.is_minimized().ok()?,
        window.is_fullscreen().ok()?,
    );
    let after_scale = window.scale_factor().ok()?;
    let after_monitor = window.current_monitor().ok()??;
    if flags != after
        || scale != after_scale
        || work_bounds(&monitor) != work_bounds(&after_monitor)
    {
        return None;
    }
    Some(FrameObservation {
        bounds: Bounds {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
        scale,
        work: work_bounds(&monitor),
        maximized: flags.0,
        minimized: flags.1,
        fullscreen: flags.2,
    })
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn remember_frame(saved: &mut Saved, frame: FrameObservation) {
    if frame.minimized || frame.fullscreen {
        return;
    }
    if frame.bounds.width == 0
        || frame.bounds.height == 0
        || frame.work.width == 0
        || frame.work.height == 0
        || !frame.scale.is_finite()
        || frame.scale <= 0.0
    {
        return;
    }
    saved.maximized = frame.maximized;
    // Also reject the full work-area rectangle when a zoom transition emits a
    // resize before its native maximized flag settles. Do not let transient
    // zoom/full-screen frames replace the last normal rectangle.
    if frame.maximized || frame.bounds == frame.work {
        return;
    }
    saved.bounds = frame.bounds;
    saved.scale = frame.scale;
    saved.monitor_work = Some(frame.work);
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn observe(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<WindowGeometry>() else {
        return;
    };
    if !state.writable || !state.ready.load(Ordering::SeqCst) {
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // Query the native window before taking the state lock: window callbacks
    // may be delivered synchronously while the native API runs.
    let Some(frame) = capture_frame(&window) else {
        return;
    };
    if let Ok(mut saved) = state.saved.lock() {
        remember_frame(&mut saved, frame);
    };
}

pub fn restore_maximized(app: &tauri::AppHandle) {
    let maximize = app
        .try_state::<WindowGeometry>()
        .and_then(|state| state.saved.lock().ok().map(|saved| saved.maximized))
        .unwrap_or(false);
    if maximize {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.maximize();
        }
    }
    if let Some(state) = app.try_state::<WindowGeometry>() {
        state.ready.store(true, Ordering::SeqCst);
    }
}

pub fn persist(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<WindowGeometry>() else {
        return;
    };
    if !state.writable {
        return;
    }
    let Ok(mut saved) = state.saved.lock().map(|s| *s) else {
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::WindowsAndMessaging::{
                GetWindowPlacement, SW_SHOWMAXIMIZED, WINDOWPLACEMENT, WPF_RESTORETOMAXIMIZED,
            };
            let mut placement = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            if let Ok(hwnd) = window.hwnd() {
                // Native placement retains the normal rectangle during maximize/minimize.
                // Reading at approved exit avoids WM_SIZE's transient IsZoomed state.
                if unsafe { GetWindowPlacement(hwnd, &mut placement) }.is_ok() {
                    let rect = placement.rcNormalPosition;
                    if rect.right > rect.left && rect.bottom > rect.top {
                        let monitor = window.current_monitor().ok().flatten();
                        let (dx, dy) = monitor
                            .as_ref()
                            .map(|m| {
                                (
                                    m.work_area().position.x - m.position().x,
                                    m.work_area().position.y - m.position().y,
                                )
                            })
                            .unwrap_or((0, 0));
                        saved.bounds = Bounds {
                            x: rect.left.saturating_add(dx),
                            y: rect.top.saturating_add(dy),
                            width: (rect.right as i64 - rect.left as i64) as u32,
                            height: (rect.bottom as i64 - rect.top as i64) as u32,
                        };
                        saved.scale = window.scale_factor().unwrap_or(saved.scale);
                        saved.monitor_work =
                            monitor.as_ref().map(work_bounds).or(saved.monitor_work);
                        saved.maximized = placement.showCmd == SW_SHOWMAXIMIZED.0 as u32
                            || (placement.flags.0 & WPF_RESTORETOMAXIMIZED.0) != 0;
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            if let Some(frame) = capture_frame(&window) {
                remember_frame(&mut saved, frame);
            }
        }
    }
    if let Some(parent) = state.path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            eprintln!(
                "window geometry: preference directory failed ({:?})",
                error.kind()
            );
            return;
        }
    }
    let temporary = state.path.with_extension("json.pending");
    if let Ok(bytes) = serde_json::to_vec(&saved) {
        match std::fs::write(&temporary, bytes) {
            Ok(()) => {
                if let Err(error) = std::fs::rename(temporary, &state.path) {
                    eprintln!(
                        "window geometry: preference replacement failed ({:?})",
                        error.kind()
                    );
                }
            }
            Err(error) => eprintln!(
                "window geometry: temporary preference write failed ({:?})",
                error.kind()
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn first_run_uses_most_of_work_area_with_margin() {
        let b = first_run(Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        });
        assert_eq!((b.width, b.height), (1766, 957));
        assert!(
            b.x > 0 && b.y > 0 && b.x + (b.width as i32) < 1920 && b.y + (b.height as i32) < 1040
        );
    }
    #[test]
    fn disconnected_or_high_dpi_geometry_fits_small_screen() {
        let b = fit(
            Bounds {
                x: -1280,
                y: 0,
                width: 1280,
                height: 680,
            },
            Bounds {
                x: 3000,
                y: -200,
                width: 2800,
                height: 1800,
            },
        );
        assert_eq!((b.x, b.y, b.width, b.height), (-1280, 0, 1280, 680));
    }
    #[test]
    fn user_adjustment_remains_unchanged_when_it_fits() {
        let b = fit(
            Bounds {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1040,
            },
            Bounds {
                x: -1800,
                y: 70,
                width: 1100,
                height: 700,
            },
        );
        assert_eq!((b.x, b.y, b.width, b.height), (-1800, 70, 1100, 700));
    }

    fn observed(bounds: Bounds) -> FrameObservation {
        FrameObservation {
            bounds,
            scale: 1.0,
            work: Bounds {
                x: 2048,
                y: 30,
                width: 2048,
                height: 1122,
            },
            maximized: false,
            minimized: false,
            fullscreen: false,
        }
    }
    fn initial_saved() -> Saved {
        Saved {
            version: 1,
            bounds: Bounds {
                x: 2130,
                y: 75,
                width: 1502,
                height: 852,
            },
            scale: 1.0,
            maximized: false,
            monitor_work: Some(
                observed(Bounds {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                })
                .work,
            ),
        }
    }
    #[test]
    fn changed_normal_frame_survives_maximize_and_serialized_exit() {
        let mut saved = initial_saved();
        let normal = Bounds {
            x: 2200,
            y: 95,
            width: 1412,
            height: 782,
        };
        remember_frame(&mut saved, observed(normal));
        let zoom = FrameObservation {
            bounds: observed(normal).work,
            maximized: true,
            ..observed(normal)
        };
        remember_frame(&mut saved, zoom);
        let restored: Saved = serde_json::from_slice(&serde_json::to_vec(&saved).unwrap()).unwrap();
        assert_eq!(restored.bounds, normal);
        assert!(restored.maximized);
        assert_eq!(restored.monitor_work, Some(zoom.work));
    }
    #[test]
    fn transient_zoom_minimized_and_fullscreen_do_not_overwrite_normal() {
        let mut saved = initial_saved();
        let normal = saved.bounds;
        let base = observed(normal);
        remember_frame(
            &mut saved,
            FrameObservation {
                bounds: base.work,
                ..base
            },
        );
        assert_eq!(saved.bounds, normal);
        remember_frame(
            &mut saved,
            FrameObservation {
                maximized: true,
                ..base
            },
        );
        for frame in [
            FrameObservation {
                bounds: base.work,
                minimized: true,
                ..base
            },
            FrameObservation {
                bounds: base.work,
                fullscreen: true,
                ..base
            },
        ] {
            remember_frame(&mut saved, frame);
            assert_eq!(saved.bounds, normal);
            assert!(saved.maximized);
        }
    }
    #[test]
    fn move_resize_scale_and_unmaximize_update_a_coherent_normal_frame() {
        let mut saved = initial_saved();
        for i in 0..3 {
            let frame = FrameObservation {
                bounds: Bounds {
                    x: -1200 + i,
                    y: 70 + i,
                    width: 1100,
                    height: 700,
                },
                scale: 2.0,
                work: Bounds {
                    x: -1280,
                    y: 0,
                    width: 1280,
                    height: 900,
                },
                ..observed(saved.bounds)
            };
            remember_frame(&mut saved, frame);
            remember_frame(
                &mut saved,
                FrameObservation {
                    maximized: true,
                    bounds: frame.work,
                    ..frame
                },
            );
            assert_eq!(saved.bounds, frame.bounds);
            remember_frame(&mut saved, frame);
            assert!(!saved.maximized);
            assert_eq!(saved.scale, 2.0);
            assert_eq!(saved.monitor_work, Some(frame.work));
        }
    }
    #[test]
    fn invalid_measurement_does_not_replace_normal_bounds() {
        let mut saved = initial_saved();
        let normal = saved.bounds;
        saved.maximized = true;
        let frame = observed(normal);
        remember_frame(
            &mut saved,
            FrameObservation {
                scale: f64::NAN,
                ..frame
            },
        );
        remember_frame(
            &mut saved,
            FrameObservation {
                bounds: Bounds { width: 0, ..normal },
                ..frame
            },
        );
        assert_eq!(saved.bounds, normal);
        assert!(saved.maximized);
    }
}
