use base64::Engine;
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;

// ----------------------------------------------------------------------------
// 設定・パス
// ----------------------------------------------------------------------------

pub const API_BASE: &str = "https://cs-launcher-api.akane-minori-cslauncher.workers.dev";

/// ランチャーの実行ファイルがあるフォルダ
fn exe_dir() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "実行ファイルのディレクトリを取得できませんでした".to_string())
}

/// ランチャーの実行ファイルと同じフォルダにある "Games" フォルダを返す
pub fn games_root_dir() -> Result<PathBuf, String> {
    Ok(exe_dir()?.join("Games"))
}

/// ゲームごとのダウンロード・展開先ディレクトリを返す
pub fn game_dir(game_id: &str) -> Result<PathBuf, String> {
    Ok(games_root_dir()?.join(game_id))
}

/// オフライン時のフォールバック用に、取得したJSONを保存しておくディレクトリ
pub fn cache_dir() -> Result<PathBuf, String> {
    let dir = exe_dir()?.join(".cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// ----------------------------------------------------------------------------
// URL の組み立て
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// リモート取得(JSON・サムネイル・ファイルサイズ)
// ----------------------------------------------------------------------------

/// Cloudflare Workers経由でR2上のJSONファイルを取得する。
/// 取得できたら .cache/ に保存し、次回オフラインだった場合はそのキャッシュを返す。
#[tauri::command]
pub async fn fetch_remote_json(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let url = format!("{}/{}", API_BASE, path);
    let live_result = fetch_live(&url).await;

    let cache_file = cache_dir()?.join(path.replace('/', "_"));

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

/// サムネイル画像をR2(Workers経由)から取得し、base64のdata URLとして返す
#[tauri::command]
pub async fn fetch_thumbnail_base64(game_id: String, path: String) -> Result<String, String> {
    let url = build_asset_url(&game_id, &path)?;
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

/// ダウンロード前に、R2上のzipファイルのサイズだけをHEADリクエストで取得する
#[tauri::command]
pub async fn get_remote_file_size(game_id: String, path: String) -> Result<u64, String> {
    let url = build_asset_url(&game_id, &path)?;
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

// ----------------------------------------------------------------------------
// ダウンロード
// ----------------------------------------------------------------------------

/// R2(Cloudflare Workers経由)からゲームのzipをダウンロードし、game_dir配下に展開する。
/// 展開後、入れた版を .installed.json に記録する。
#[tauri::command]
pub async fn download_game(
    app: tauri::AppHandle,
    game_id: String,
    archive_filename: String,
    version: String,
) -> Result<(), String> {
    let url = build_asset_url(&game_id, &archive_filename)?;
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("ダウンロードに失敗しました: {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let dest_dir = game_dir(&game_id)?;
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let archive_path = dest_dir.join("game.zip");

    {
        let mut file = tokio::fs::File::create(&archive_path)
            .await
            .map_err(|e| e.to_string())?;
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

    // 入れた版を記録する(アップデート判定用)
    let escaped = version.replace('\\', "\\\\").replace('"', "\\\"");
    let json = format!("{{\"version\":\"{}\"}}", escaped);
    std::fs::write(dest_dir.join(".installed.json"), json).map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&archive_path);
    Ok(())
}

// ----------------------------------------------------------------------------
// 起動・フォルダ操作
// ----------------------------------------------------------------------------

/// ローカルにダウンロード済みのゲーム実行ファイルを起動する
#[tauri::command]
pub fn launch_game(game_id: String, exe_relative_path: String) -> Result<(), String> {
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
    Ok(())
}

/// ゲームのダウンロード先フォルダをエクスプローラーで開く
#[tauri::command]
pub fn open_game_folder(app: tauri::AppHandle, game_id: String) -> Result<(), String> {
    let dest_dir = game_dir(&game_id)?;
    app.opener()
        .open_path(dest_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// 全ゲームの保存先ルートフォルダ(ランチャー本体の隣のGames/)をエクスプローラーで開く。
/// まだ1本もダウンロードしていない場合はフォルダを作成してから開く。
#[tauri::command]
pub fn open_games_root_folder(app: tauri::AppHandle) -> Result<(), String> {
    let games_root = games_root_dir()?;
    std::fs::create_dir_all(&games_root).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(games_root.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// ゲームが既にダウンロード・展開済みかどうかを、フォルダの存在で判定する
#[tauri::command]
pub fn is_game_downloaded(game_id: String) -> Result<bool, String> {
    let dest_dir = game_dir(&game_id)?;
    Ok(dest_dir.exists() && dest_dir.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false))
}

/// 端末に入っているゲームの版を、.installed.json から読み取る。
/// ファイルが無い・読めない場合は None を返す。
#[tauri::command]
pub fn get_installed_version(game_id: String) -> Result<Option<String>, String> {
    let path = game_dir(&game_id)?.join(".installed.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let key = "\"version\":\"";
    let start = match text.find(key) {
        Some(i) => i + key.len(),
        None => return Ok(None),
    };
    let rest = &text[start..];
    match rest.find('"') {
        Some(end) => Ok(Some(rest[..end].to_string())),
        None => Ok(None),
    }
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

/// フォルダ内の合計サイズをバイト単位で再帰的に計算する
fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    total += dir_size(&entry.path());
                } else {
                    total += metadata.len();
                }
            }
        }
    }
    total
}

/// ダウンロード済みゲームフォルダの合計サイズ(バイト)を取得する。未ダウンロードなら0。
#[tauri::command]
pub fn get_game_folder_size(game_id: String) -> Result<u64, String> {
    let dest_dir = game_dir(&game_id)?;
    if !dest_dir.exists() {
        return Ok(0);
    }
    Ok(dir_size(&dest_dir))
}

// ----------------------------------------------------------------------------
// プレイ集計
// ----------------------------------------------------------------------------

/// プレイ回数の集計用に、ゲームIDだけをWorkerへ送る(日付はWorker側でJSTに変換される)
#[tauri::command]
pub async fn report_play(game_id: String) -> Result<(), String> {
    let escaped = game_id.replace('\\', "\\\\").replace('"', "\\\"");
    let body = format!("{{\"game_id\":\"{}\"}}", escaped);

    let resp = reqwest::Client::new()
        .post(format!("{}/plays", API_BASE))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("送信に失敗しました: {}", resp.status()));
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// ランチャー本体の自己アップデート
// ----------------------------------------------------------------------------

/// 現在動いているexeのパスに、拡張子を足したパスを返す(例: cs-launcher.exe → cs-launcher.exe.old)
fn exe_path_with_suffix(suffix: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut name = exe.as_os_str().to_owned();
    name.push(suffix);
    Ok(PathBuf::from(name))
}

/// 前回のアップデートで残った .exe.old を削除する。起動時に呼ぶ。失敗しても無視する。
pub fn cleanup_old_exe() {
    if let Ok(old) = exe_path_with_suffix(".old") {
        let _ = std::fs::remove_file(old);
    }
}

/// 今動いているランチャーの版(Cargo.toml の version)を返す
#[tauri::command]
pub fn get_launcher_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// R2 の launcher/{filename} から新しいexeをダウンロードし、今のexeと差し替えて再起動する。
/// 実行中のexeは削除・上書きできないが、改名はできることを利用する。
#[tauri::command]
pub async fn self_update(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    if filename.is_empty() || filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("ファイル名が不正です".to_string());
    }

    // 1. 新exeを、実行ファイルと同じフォルダに .new としてダウンロードする
    let mut url = reqwest::Url::parse(API_BASE).map_err(|e| e.to_string())?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "URLの構築に失敗しました".to_string())?;
        segments.push("launcher").push(&filename);
    }
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("ダウンロードに失敗しました: {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    if total == 0 {
        return Err("ファイルサイズを確認できませんでした".to_string());
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let new_path = exe_path_with_suffix(".new")?;
    let old_path = exe_path_with_suffix(".old")?;

    let download_result: Result<(), String> = async {
        let mut file = tokio::fs::File::create(&new_path)
            .await
            .map_err(|e| e.to_string())?;
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            let _ = app.emit("self-update-progress", (downloaded, total));
        }
        file.flush().await.map_err(|e| e.to_string())?;
        if downloaded != total {
            return Err("ダウンロードが途中で終わりました".to_string());
        }
        Ok(())
    }
    .await;

    if let Err(e) = download_result {
        let _ = std::fs::remove_file(&new_path);
        return Err(e);
    }

    // 2. 実行中のexeを .old に改名する(前回の .old が残っていれば先に消す)
    let _ = std::fs::remove_file(&old_path);
    if let Err(e) = std::fs::rename(&exe, &old_path) {
        let _ = std::fs::remove_file(&new_path);
        return Err(format!("実行ファイルの改名に失敗しました: {}", e));
    }

    // 3. .new を元のexe名に改名する。失敗したら .old を元に戻す
    if let Err(e) = std::fs::rename(&new_path, &exe) {
        let _ = std::fs::rename(&old_path, &exe);
        let _ = std::fs::remove_file(&new_path);
        return Err(format!("新しい実行ファイルの配置に失敗しました: {}", e));
    }

    // 4. 新exeを起動し、今のプロセスを終了する
    let working_dir = exe.parent().map(|p| p.to_path_buf());
    let mut cmd = std::process::Command::new(&exe);
    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }
    cmd.spawn().map_err(|e| format!("新しいランチャーの起動に失敗しました: {}", e))?;
    app.exit(0);
    Ok(())
}
