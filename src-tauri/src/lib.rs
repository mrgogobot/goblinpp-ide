mod env;
mod fsx;
mod menu;
mod proc;
mod pty;
mod settings;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::TerminalState::default())
        .manage(proc::ProcState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let m = menu::build(&handle)?;
            app.set_menu(m)?;
            app.on_menu_event(|app, event| {
                menu::emit(app, event.id().0.as_str());
            });
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Goblin++ IDE");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::spawn_terminal,
            pty::write_terminal,
            pty::resize_terminal,
            pty::kill_terminal,
            pty::list_terminals,
            fsx::fs_list_dir,
            fsx::fs_read_text,
            fsx::fs_read_base64,
            fsx::fs_write_text,
            fsx::fs_create_dir,
            fsx::fs_exists,
            fsx::fs_stat,
            fsx::fs_rename,
            fsx::fs_copy,
            fsx::fs_trash,
            fsx::fs_home_dir,
            fsx::fs_search,
            fsx::fs_index_files,
            fsx::reveal_in_finder,
            fsx::open_external,
            proc::proc_spawn,
            proc::proc_write,
            proc::proc_close_stdin,
            proc::proc_kill,
            proc::proc_run,
            env::env_detect,
            env::resolve_goblin_binary,
            settings::settings_load,
            settings::settings_save,
            settings::app_paths,
            settings::log_append,
            settings::startup_open,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Goblin++ IDE");
}
