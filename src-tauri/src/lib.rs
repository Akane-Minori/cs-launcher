mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::download_game,
            commands::get_remote_file_size,
            commands::fetch_remote_json,
            commands::fetch_thumbnail_base64,
            commands::launch_game,
            commands::open_game_folder,
            commands::is_game_downloaded,
            commands::open_games_root_folder,
            commands::uninstall_game,
            commands::get_game_folder_size,
            commands::report_play,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}