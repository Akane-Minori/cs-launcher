pub mod download;
pub mod image;
pub mod launch;
pub mod remote_json;

use std::path::PathBuf;

pub const API_BASE: &str = "https://cs-launcher-api.akane-minori-cslauncher.workers.dev";

/// ランチャーの実行ファイルと同じフォルダにある "Games" フォルダを返す。
pub fn games_root_dir() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "実行ファイルのディレクトリを取得できませんでした".to_string())?;
    Ok(exe_dir.join("Games"))
}

/// ゲームごとのダウンロード・展開先ディレクトリを返す
pub fn game_dir(game_id: &str) -> Result<PathBuf, String> {
    Ok(games_root_dir()?.join(game_id))
}

/// game_id と (Games/{id}/ からの)相対パスから、Worker経由のアセットURLを組み立てる。
/// パスの各階層ごとにURLエンコードするので、日本語ファイル名やスペースを含んでいても安全。
pub fn build_asset_url(game_id: &str, relative_path: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(API_BASE).map_err(|e| e.to_string())?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "URLの構築に失敗しました".to_string())?;
        segments.push("games").push(game_id);
        for part in relative_path.split('/') {
            segments.push(part);
        }
    }
    Ok(url.to_string())
}

/// オフライン時のフォールバック用に、取得したJSONを保存しておくディレクトリ
pub fn cache_dir() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "実行ファイルのディレクトリを取得できませんでした".to_string())?;
    let dir = exe_dir.join(".cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}