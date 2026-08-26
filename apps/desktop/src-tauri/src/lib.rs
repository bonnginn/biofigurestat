#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod diagnostic;
mod digest;
mod engine;
mod project_database;
mod project_open;
mod project_storage;

use tauri::{
    menu::{Menu, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(project_open::PendingProjectOpen::from_command_line())
        .manage(project_storage::ProjectWriteState::default())
        .setup(|app| {
            let save = MenuItemBuilder::with_id("project-save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as = MenuItemBuilder::with_id("project-save-as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&save)
                .item(&save_as)
                .build()?;
            let menu = Menu::default(app.handle())?;
            menu.prepend(&file_menu)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "project-save" => {
                let _ = app.emit("project-save-request", false);
            }
            "project-save-as" => {
                let _ = app.emit("project-save-request", true);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            clipboard::copy_graph_png,
            diagnostic::write_diagnostic_report,
            digest::sha256_bytes,
            engine::run_analysis,
            project_open::take_pending_project_open,
            project_storage::begin_atomic_project_write,
            project_storage::write_project_file,
            project_storage::commit_project_write,
            project_storage::rollback_project_write,
            project_storage::read_project_file,
            project_database::encode_project_database,
            project_database::decode_project_database,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Life Science Analysis");

    app.run(|app_handle, event| {
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
