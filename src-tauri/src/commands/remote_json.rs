use tauri::Emitter;

/// Cloudflare Workers経由でR2上のJSONファイルを取得する。
/// 取得できたら .cache/ に保存し、次回オフラインだった場合はそのキャッシュを返す。
#[tauri::command]
pub async fn fetch_remote_json(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let url = format!("{}/{}", super::API_BASE, path);
    let live_result = fetch_live(&url).await;

    let cache_file = super::cache_dir()?.join(path.replace('/', "_"));

    match live_result {
        Ok(text) => {
            let _ = std::fs::write(&cache_file, &text); // 保存失敗しても致命的ではないので無視
            Ok(text)
        }
        Err(live_err) => match std::fs::read_to_string(&cache_file) {
            Ok(cached) => {
                let _ = app.emit("remote-json-fallback", path.clone());
                Ok(cached)
            }
            Err(_) => Err(live_err), // キャッシュも無ければ元のエラーをそのまま返す
        },
    }
}

async fn fetch_live(url: &str) -> Result<String, String> {
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("取得に失敗しました: {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}