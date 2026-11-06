use super::{game_dir, games_root_dir};
use tauri_plugin_opener::OpenerExt;

/// ローカルにダウンロード済みのゲーム実行ファイルを起動する
#[tauri::command]
pub fn launch_game(
    app: tauri::AppHandle,
    game_id: String,
    exe_relative_path: String,
) -> Result<(), String> {
    let dest_dir = game_dir(&game_id)?;
    let exe_path = dest_dir.join(&exe_relative_path);

    if !exe_path.exists() {
        return Err(format!("実行ファイルが見つかりません: {}", exe_path.display()));
    }

    // exeが実際に存在するフォルダを作業ディレクトリにする(サブフォルダ構成のzipに対応)
    let working_dir = exe_path.parent().unwrap_or(&dest_dir);

    std::process::Command::new(&exe_path)
        .current_dir(working_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    let _ = app;
    Ok(())
}

/// ゲームのダウンロード先フォルダをエクスプローラーで開く
#[tauri::command]
pub fn open_game_folder(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let dest_dir = game_dir(&game_id)?;
    app.opener()
        .open_path(dest_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// ゲームが既にダウンロード・展開済みかどうかを、フォルダの存在で判定する
#[tauri::command]
pub fn is_game_downloaded(game_id: String) -> Result<bool, String> {
    let dest_dir = game_dir(&game_id)?;
    Ok(dest_dir.exists() && dest_dir.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false))
}

/// ダウンロード済みのゲームフォルダを削除する(アンインストール)
#[tauri::command]
pub fn uninstall_game(game_id: String) -> Result<(), String> {
    let dest_dir = game_dir(&game_id)?;
    if dest_dir.exists() {
        std::fs::remove_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 全ゲームの保存先ルートフォルダ(ランチャー本体の隣のGames/)をエクスプローラーで開く。
/// まだ1本もダウンロードしていない場合はフォルダを作成してから開く。
#[tauri::command]
pub fn open_games_root_folder(app: tauri::AppHandle) -> Result<(), String> {
    let games_root = games_root_dir()?;
    std::fs::create_dir_all(&games_root).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(games_root.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// フォルダ内の合計サイズをバイト単位で再帰的に計算する
fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    total += dir_size(&entry_path);
                } else {
                    total += metadata.len();
                }
            }
        }
    }
    total
}

/// ダウンロード済みゲームフォルダの合計サイズ(バイト)を取得する。
/// 未ダウンロードの場合は0を返す。
#[tauri::command]
pub fn get_game_folder_size(game_id: String) -> Result<u64, String> {
    let dest_dir = game_dir(&game_id)?;
    if !dest_dir.exists() {
        return Ok(0);
    }
    Ok(dir_size(&dest_dir))
}