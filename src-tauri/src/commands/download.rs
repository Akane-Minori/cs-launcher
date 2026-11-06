use super::game_dir;
use futures_util::StreamExt;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

/// R2(Cloudflare Workers経由)からゲームのzipをダウンロードし、game_dir配下に展開する
#[tauri::command]
pub async fn download_game(
    app: tauri::AppHandle,
    game_id: String,
    archive_filename: String,
) -> Result<(), String> {
    let url = super::build_asset_url(&game_id, &archive_filename)?;
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("ダウンロードに失敗しました: {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let dest_dir = game_dir(&game_id)?;
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let archive_path = dest_dir.join("game.zip");

    {
        let mut file = tokio::fs::File::create(&archive_path).await.map_err(|e| e.to_string())?;
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            let _ = app.emit("download-progress", (game_id.clone(), downloaded, total));
        }
    }

    let archive_path_clone = archive_path.clone();
    let dest_dir_clone = dest_dir.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::open(&archive_path_clone).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        zip.extract(&dest_dir_clone).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = std::fs::remove_file(&archive_path);
    Ok(())
}

/// ダウンロード前に、R2上のzipファイルのサイズだけをHEADリクエストで取得する
#[tauri::command]
pub async fn get_remote_file_size(game_id: String, path: String) -> Result<u64, String> {
    let url = super::build_asset_url(&game_id, &path)?;
    let client = reqwest::Client::new();
    let resp = client.head(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(0);
    }
    let size = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    Ok(size)
}