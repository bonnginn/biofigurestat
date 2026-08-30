#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod diagnostic;
mod digest;
mod engine;
mod export_file;
mod project_database;
mod project_open;
mod project_storage;
mod spreadsheet_import;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

#[derive(Default)]
struct ApprovedApplicationExit(AtomicBool);

#[tauri::command]
fn exit_application(app: tauri::AppHandle, approved: tauri::State<'_, ApprovedApplicationExit>) {
    // The UI invokes this only after its shared unsaved-workspace guard has completed.
    // Keeping final process termination in Rust avoids depending on WebView window-destroy ACLs.
    approved.0.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn native_architecture() -> &'static str {
    std::env::consts::ARCH
}

fn exit_requires_workspace_guard(approved: bool) -> bool {
    // Both Command+Q and a programmatic app.exit(0) may carry an explicit exit
    // code on macOS.  The exit code therefore cannot establish that the UI's
    // Save / Cancel / discard guard ran.  Only the one-shot approval set by the
    // guarded `exit_application` command may allow process termination.
    !approved
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(project_open::PendingProjectOpen::from_command_line())
        .manage(project_storage::ProjectWriteState::default())
        .manage(engine::EngineProcessRegistry::default())
        .manage(ApprovedApplicationExit::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Intercept the native title-bar close before Windows destroys the
                // WebView.  The JavaScript close listener is useful as a secondary
                // signal, but it is not a safe persistence boundary by itself: the
                // operating-system close may win the race and remove the only UI
                // capable of presenting Save / Cancel / discard.
                api.prevent_close();
                let _ = window.app_handle().emit("app-exit-request", ());
            }
        })
        .setup(|app| {
            let open = MenuItemBuilder::with_id("project-open", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save = MenuItemBuilder::with_id("project-save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as = MenuItemBuilder::with_id("project-save-as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let exit = MenuItemBuilder::with_id("app-exit", "終了").build(app)?;
            let file_menu_builder = SubmenuBuilder::new(app, "File")
                .item(&open)
                .item(&save)
                .item(&save_as)
                .separator()
                .item(&exit);
            let file_menu = file_menu_builder.build()?;
            let menu = Menu::default(app.handle())?;
            // Replace Tauri's default File menu instead of prepending a second File menu.
            // macOS has an application menu before File; Windows does not.
            #[cfg(target_os = "macos")]
            let file_menu_position = 1;
            #[cfg(not(target_os = "macos"))]
            let file_menu_position = 0;
            menu.remove_at(file_menu_position)?;
            menu.insert(&file_menu, file_menu_position)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "project-open" => {
                let _ = app.emit("project-open-menu-request", ());
            }
            "project-save" => {
                let _ = app.emit("project-save-request", false);
            }
            "project-save-as" => {
                let _ = app.emit("project-save-request", true);
            }
            "app-exit" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            exit_application,
            native_architecture,
            clipboard::copy_graph_png,
            diagnostic::write_diagnostic_report,
            digest::sha256_bytes,
            engine::run_analysis,
            engine::cancel_analysis,
            export_file::write_export_file,
            project_open::take_pending_project_open,
            project_storage::begin_atomic_project_write,
            project_storage::write_project_file,
            project_storage::commit_project_write,
            project_storage::rollback_project_write,
            project_storage::read_project_file,
            project_database::encode_project_database,
            project_database::decode_project_database,
            spreadsheet_import::read_spreadsheet_workbook,
        ])
        .build(tauri::generate_context!())
        .expect("error while building BioFigureStat");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            let approved = app_handle
                .state::<ApprovedApplicationExit>()
                .0
                .swap(false, Ordering::SeqCst);
            if exit_requires_workspace_guard(approved) {
                api.prevent_exit();
                let _ = app_handle.emit("app-exit-request", ());
            }
        }

        if matches!(event, tauri::RunEvent::Ready) {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }

        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            let targets = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| {
                    path.extension()
                        .is_some_and(|extension| extension.eq_ignore_ascii_case("lsa"))
                })
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            if targets.is_empty() {
                return;
            }
            let pending = app_handle.state::<project_open::PendingProjectOpen>();
            for target in &targets {
                pending.push(target.clone());
            }
            let _ = app_handle.emit("project-open-request", targets);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::exit_requires_workspace_guard;

    #[test]
    fn all_unapproved_exit_routes_require_the_workspace_guard() {
        assert!(exit_requires_workspace_guard(false));
    }

    #[test]
    fn explicitly_approved_programmatic_exit_is_not_guarded_twice() {
        assert!(!exit_requires_workspace_guard(true));
    }
}
