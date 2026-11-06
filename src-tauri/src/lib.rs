mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::download::download_game,
            commands::download::get_remote_file_size,
            commands::remote_json::fetch_remote_json,
            commands::image::fetch_thumbnail_base64,
            commands::launch::launch_game,
            commands::launch::open_game_folder,
            commands::launch::is_game_downloaded,
            commands::launch::open_games_root_folder,
            commands::launch::uninstall_game,
            commands::launch::get_game_folder_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}