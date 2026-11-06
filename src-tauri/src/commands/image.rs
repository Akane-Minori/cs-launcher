use base64::Engine;

/// サムネイル画像をR2(Workers経由)から取得し、base64のdata URLとして返す
#[tauri::command]
pub async fn fetch_thumbnail_base64(game_id: String, path: String) -> Result<String, String> {
    let url = super::build_asset_url(&game_id, &path)?;
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}