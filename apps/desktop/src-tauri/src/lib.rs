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
#[cfg(any(target_os = "windows", target_os = "macos"))]
mod window_geometry;

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
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    window_geometry::persist(&app);
    app.exit(0);
}

#[tauri::command]
fn native_architecture() -> &'static str {
    std::env::consts::ARCH
}

fn exit_requires_workspace_guard(approved: bool) -> bool {
    // A programmatic exit may carry an explicit exit code. The code cannot
    // establish that the UI's
    // Save / Cancel / discard guard ran.  Only the one-shot approval set by the
    // guarded `exit_application` command may allow process termination.
    !approved
}

// Kept type-checked on Windows too; only macOS installs this application menu.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn replace_native_application_quit<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    menu: &Menu<R>,
) -> tauri::Result<()> {
    use tauri::menu::MenuItemKind;
    // In pinned Tauri 2.11.4, the first macOS submenu is the application menu
    // and its last item is native Quit. Preserve About, Services and Hide items.
    let menus = menu.items()?;
    let Some(MenuItemKind::Submenu(application_menu)) = menus.first() else {
        return Err(std::io::Error::other("Application menu is missing").into());
    };
    let items = application_menu.items()?;
    let Some(MenuItemKind::Predefined(native_quit)) = items.last() else {
        return Err(std::io::Error::other("Default application Quit is missing").into());
    };
    let guarded_quit = MenuItemBuilder::with_id("app-exit", native_quit.text()?)
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    // Muda's native Quit invokes NSApplication terminate: directly. It does not
    // wait for our asynchronous workspace guard/exit_application persistence.
    application_menu.remove(native_quit)?;
    application_menu.append(&guarded_quit)?;
    Ok(())
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
            #[cfg(target_os = "macos")]
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::Moved(_)
                        | tauri::WindowEvent::Resized(_)
                        | tauri::WindowEvent::ScaleFactorChanged { .. }
                )
            {
                window_geometry::observe(window.app_handle());
            }
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
            #[cfg(not(target_os = "macos"))]
            let exit = MenuItemBuilder::with_id("app-exit", "終了").build(app)?;
            let file_menu_builder = SubmenuBuilder::new(app, "File")
                .item(&open)
                .item(&save)
                .item(&save_as);
            #[cfg(not(target_os = "macos"))]
            let file_menu_builder = file_menu_builder.separator().item(&exit);
            let file_menu = file_menu_builder.build()?;
            let menu = Menu::default(app.handle())?;
            #[cfg(target_os = "macos")]
            replace_native_application_quit(app.handle(), &menu)?;
            // Replace Tauri's default File menu instead of prepending a second File menu.
            // macOS has an application menu before File; Windows does not.
            #[cfg(target_os = "macos")]
            let file_menu_position = 1;
            #[cfg(not(target_os = "macos"))]
            let file_menu_position = 0;
            menu.remove_at(file_menu_position)?;
            menu.insert(&file_menu, file_menu_position)?;
            app.set_menu(menu)?;
            #[cfg(any(target_os = "windows", target_os = "macos"))]
            window_geometry::initialize(app)?;
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
                // Menu Quit needs one guard request, not both native close
                // listeners. The approved UI command performs final termination.
                let _ = app.emit("app-exit-request", ());
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
                #[cfg(any(target_os = "windows", target_os = "macos"))]
                window_geometry::restore_maximized(app_handle);
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
