Project Path: cs-launcher

Source Tree:

```txt
cs-launcher
├── src
│   ├── api.ts
│   ├── downloadState.ts
│   ├── env.d.ts
│   ├── fromRust.ts
│   ├── gameCard.ts
│   ├── gameModal.ts
│   ├── listView.ts
│   ├── localStore.ts
│   ├── main.ts
│   └── topArea.ts
└── src-tauri
    └── src
        ├── commands.rs
        ├── lib.rs
        └── main.rs

```

`src-tauri\src\commands.rs`:

```rs
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

/// R2(Cloudflare Workers経由)からゲームのzipをダウンロードし、game_dir配下に展開する
#[tauri::command]
pub async fn download_game(
    app: tauri::AppHandle,
    game_id: String,
    archive_filename: String,
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

```
`src-tauri\src\lib.rs`:

```rs
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
```
`src-tauri\src\main.rs`:

```rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cs_launcher_lib::run()
}

```
`src\api.ts`:

```ts
import { getGameFolderSize, getRemoteFileSize } from './fromRust';

// ----------------------------------------------------------------------------
// 設定
// ----------------------------------------------------------------------------

export const API_BASE = 'https://cs-launcher-api.akane-minori-cslauncher.workers.dev';

// ----------------------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------------------

export type GameType = 'download' | 'web_link';
export type GameStatus = 'not_downloaded' | 'downloading' | 'downloaded';

export interface GameEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  type: GameType;
  thumbnail_path: string;
  screenshot_paths?: string[];
  authors?: string[];
  year?: number; // 制作した年
  created_at?: string; // 登録日 YYYY-MM-DD
  updated_at?: string; // 更新日 YYYY-MM-DD
  version?: string; // download のみ

  // type: "download" のときに使う
  archive_filename?: string;
  exe_relative_path?: string;

  // type: "web_link" のときに使う
  url?: string;
}

export interface Campaign {
  id: string;
  title: string;
  description?: string;
  game_ids: string[];
}

// ----------------------------------------------------------------------------
// サムネイルURL
// ----------------------------------------------------------------------------

/**
 * ゲームIDと(Games/{id}/からの)相対パスから、<img>のsrcに直接使えるURLを組み立てる。
 * 日本語ファイル名やスペースを含むパスにも対応するため、階層ごとにエンコードする。
 */
export function thumbUrl(gameId: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/games/${encodeURIComponent(gameId)}/${encodedPath}`;
}

// ----------------------------------------------------------------------------
// バイト数の表記
// ----------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

// ----------------------------------------------------------------------------
// ファイルサイズの取得と表示
// ----------------------------------------------------------------------------

/** ダウンロード済みのローカルフォルダ容量を表示する */
export async function renderFolderSize(el: HTMLElement, gameId: string) {
  el.hidden = false;
  el.textContent = '容量を計算中…';
  try {
    const bytes = await getGameFolderSize(gameId);
    el.textContent = `容量: ${formatBytes(bytes)}`;
  } catch {
    el.hidden = true;
  }
}

/** 未ダウンロード時、配信元(R2)のファイルサイズを表示する */
export async function renderRemoteSize(el: HTMLElement, gameId: string, archiveFilename: string) {
  el.hidden = false;
  el.textContent = '容量を確認中…';
  try {
    const bytes = await getRemoteFileSize(gameId, archiveFilename);
    el.textContent = bytes > 0 ? `ダウンロード容量: ${formatBytes(bytes)}` : '';
    if (bytes === 0) el.hidden = true;
  } catch {
    el.hidden = true;
  }
}

export function hideFolderSize(el: HTMLElement) {
  el.hidden = true;
}

// ----------------------------------------------------------------------------
// HTMLエスケープ
// ----------------------------------------------------------------------------

/** innerHTML に文字列を埋め込む前に、<, &, " などを無害な文字へ変換する */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;');
}


```
`src\downloadState.ts`:

```ts
import { downloadGame } from './fromRust';
import type { GameEntry } from './api';

type BeginListener = () => void;
const beginListeners = new Map<string, Set<BeginListener>>();

export function subscribeBegin(gameId: string, cb: BeginListener): () => void {
  if (!beginListeners.has(gameId)) beginListeners.set(gameId, new Set());
  beginListeners.get(gameId)!.add(cb);
  return () => beginListeners.get(gameId)?.delete(cb);
}

// 既存のbeginDownloadを差し替え(末尾でリスナーに通知するようにする)
export function beginDownload(gameId: string): void {
  active.set(gameId, { downloaded: 0, total: 0 });
  beginListeners.get(gameId)?.forEach((cb) => cb());
}

/**
 * ダウンロード処理そのものをまとめた共通関数。
 * 個別の「ダウンロード」ボタンからも、「すべてダウンロード」からも、これを呼ぶ。
 */
export async function startDownload(game: GameEntry): Promise<boolean> {
  if (isDownloading(game.id)) return false; // 二重起動防止
  beginDownload(game.id);
  try {
    await downloadGame(game, (downloaded, total) => reportProgress(game.id, downloaded, total));
    finishDownload(game.id, { success: true });
    return true;
  } catch {
    finishDownload(game.id, { success: false });
    return false;
  }
}

/**
 * ダウンロード中のゲームIDを、カード・詳細モーダルなど複数箇所で共有するためのモジュール。
 * これが無いと、カードでダウンロード中でも、他の場所(詳細モーダルなど)は
 * バックエンドに「完了済みか」を聞くだけになり、完了前でも完了扱いになってしまう。
 */
export interface DownloadProgress {
  downloaded: number;
  total: number;
}

type ProgressListener = (progress: DownloadProgress) => void;
type DoneListener = (result: { success: boolean }) => void;

const active = new Map<string, DownloadProgress>();
const progressListeners = new Map<string, Set<ProgressListener>>();
const doneListeners = new Map<string, Set<DoneListener>>();

export function isDownloading(gameId: string): boolean {
  return active.has(gameId);
}

export function getProgress(gameId: string): DownloadProgress | undefined {
  return active.get(gameId);
}

export function reportProgress(gameId: string, downloaded: number, total: number): void {
  active.set(gameId, { downloaded, total });
  progressListeners.get(gameId)?.forEach((cb) => cb({ downloaded, total }));
}

export function finishDownload(gameId: string, result: { success: boolean }): void {
  active.delete(gameId);
  doneListeners.get(gameId)?.forEach((cb) => cb(result));
  progressListeners.delete(gameId);
  doneListeners.delete(gameId);
}

export function subscribeProgress(gameId: string, cb: ProgressListener): () => void {
  if (!progressListeners.has(gameId)) progressListeners.set(gameId, new Set());
  progressListeners.get(gameId)!.add(cb);
  return () => progressListeners.get(gameId)?.delete(cb);
}

export function subscribeDone(gameId: string, cb: DoneListener): () => void {
  if (!doneListeners.has(gameId)) doneListeners.set(gameId, new Set());
  doneListeners.get(gameId)!.add(cb);
  return () => doneListeners.get(gameId)?.delete(cb);
}
```
`src\env.d.ts`:

```ts
declare module '*.css';

```
`src\fromRust.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Campaign, GameEntry, GameStatus } from './api';
import { bumpPlay, recordPlay, type PlayRow } from './localStore';


export async function listGames(): Promise<GameEntry[]> {
  const text = await invoke<string>('fetch_remote_json', { path: 'games.json' });
  return JSON.parse(text);
}

export async function listCampaigns(): Promise<Campaign[]> {
  const text = await invoke<string>('fetch_remote_json', { path: 'campaigns.json' });
  return JSON.parse(text);
}

/** プレイ回数(日付ごとの行)を取得する */
export async function listPlays(): Promise<PlayRow[]> {
  const text = await invoke<string>('fetch_remote_json', { path: 'plays' });
  return JSON.parse(text);
}

export async function getGameStatus(gameId: string): Promise<GameStatus> {
  const downloaded = await invoke<boolean>('is_game_downloaded', { gameId });
  return downloaded ? 'downloaded' : 'not_downloaded';
}

/**
 * ゲーム本体をダウンロード・展開する。
 * onProgress は download-progress イベントを受け取るたびに呼ばれる。
 */
export async function downloadGame(
  game: GameEntry,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  const unlisten = await listen<[string, number, number]>('download-progress', (event) => {
    const [id, downloaded, total] = event.payload;
    if (id === game.id) onProgress(downloaded, total);
  });

  try {
    await invoke('download_game', {
      gameId: game.id,
      archiveFilename: game.archive_filename ?? 'game.zip',
    });
  } finally {
    unlisten();
  }
}

/**
 * ゲームを遊ぶ。web_linkタイプは既定のブラウザで開き、
 * downloadタイプはローカルの実行ファイルを起動する。
 */
export async function playGame(game: GameEntry): Promise<void> {
  recordPlay(game.id);

  if (game.type === 'web_link') {
    if (!game.url) throw new Error('urlが設定されていません');
    await openUrl(game.url);
    void reportPlay(game.id);
    return;
  }

  if (!game.exe_relative_path) {
    throw new Error('exe_relative_pathが設定されていません');
  }
  await invoke('launch_game', {
    gameId: game.id,
    exeRelativePath: game.exe_relative_path,
  });
  void reportPlay(game.id);
}

/** プレイ回数の集計用に、ゲームIDだけを送る。失敗してもゲーム起動は止めない */
async function reportPlay(gameId: string): Promise<void> {
  try {
    await invoke('report_play', { gameId });
    bumpPlay(gameId);
  } catch {
    // オフラインなどで失敗しても無視する
  }
}

export async function openGameFolder(gameId: string): Promise<void> {
  await invoke('open_game_folder', { gameId });
}

export async function openGamesRootFolder(): Promise<void> {
  await invoke('open_games_root_folder');
}

export async function uninstallGame(gameId: string): Promise<void> {
  await invoke('uninstall_game', { gameId });
}

/**
 * サムネイル画像をbase64のdata URLとして取得する(Rust経由)。
 */
export async function fetchThumbnailDataUrl(gameId: string, path: string): Promise<string> {
  return invoke<string>('fetch_thumbnail_base64', { gameId, path });
}

export async function getGameFolderSize(gameId: string): Promise<number> {
  return invoke<number>('get_game_folder_size', { gameId });
}

export async function getRemoteFileSize(gameId: string, path: string): Promise<number> {
  return invoke<number>('get_remote_file_size', { gameId, path });
}

```
`src\gameCard.ts`:

```ts
import { type GameEntry, type GameStatus, thumbUrl, renderFolderSize, renderRemoteSize, hideFolderSize, escapeHtml } from './api';
import { getGameStatus, playGame, openGameFolder, uninstallGame } from './fromRust';
import { openDetailModal } from './gameModal';
import { isFavorite, toggleFavorite, getPlayCount } from './localStore';
import { isDownloading, getProgress, subscribeProgress, subscribeDone, startDownload, subscribeBegin } from './downloadState';

// ----------------------------------------------------------------------------
// ゲームカード
// ----------------------------------------------------------------------------

export async function createGameCard(
  game: GameEntry,
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
): Promise<HTMLElement> {
  const status: GameStatus =
    game.type === 'web_link'
      ? 'downloaded'
      : isDownloading(game.id)
        ? 'downloading'
        : await getGameStatus(game.id);

  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.gameId = game.id;
  card.innerHTML = `
    <div class="game-card__thumb-wrap">
      <img class="game-card__thumb" src="${thumbUrl(game.id, game.thumbnail_path)}" alt="${escapeHtml(game.title)}">
      <button class="game-card__favorite${isFavorite(game.id) ? ' is-active' : ''}" type="button" aria-label="いいね">♥</button>
    </div>
    <div class="game-card__body">
      <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
      <div class="game-card__tags">
        ${game.tags.map((t) => `<span class="game-card__tag">${escapeHtml(t)}</span>`).join('')}
      </div>
      <p class="game-card__description">${escapeHtml(game.description)}</p>
      <div class="game-card__meta">
        <span class="game-card__year">${game.year !== undefined ? `${escapeHtml(String(game.year))}年` : ''}</span>
        <span class="game-card__plays">▶ ${getPlayCount(game.id)}</span>
      </div>
      <div class="game-card__progress" hidden>
        <div class="game-card__progress-bar"></div>
      </div>
      <div class="game-card__footer">
        <div class="game-card__size" hidden></div>
        <div class="game-card__actions"></div>
      </div>
    </div>
  `;

  function updateActions(s: GameStatus) {
    renderGameActions(
      {
        actionsEl: card.querySelector<HTMLElement>('.game-card__actions')!,
        progressWrapEl: card.querySelector<HTMLElement>('.game-card__progress')!,
        progressBarEl: card.querySelector<HTMLElement>('.game-card__progress-bar')!,
      },
      game,
      s,
      updateActions
    );
    const sizeEl = card.querySelector<HTMLElement>('.game-card__size')!;
    if (game.type === 'web_link') {
      hideFolderSize(sizeEl);
    } else if (status === 'downloaded') {
      renderFolderSize(sizeEl, game.id);
    } else if (game.archive_filename) {
      renderRemoteSize(sizeEl, game.id, game.archive_filename);
    } else {
      hideFolderSize(sizeEl);
    }
  }
  updateActions(status);

  const favBtn = card.querySelector<HTMLButtonElement>('.game-card__favorite')!;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowFav = toggleFavorite(game.id);
    favBtn.classList.toggle('is-active', nowFav);
    onFavoriteChange();
  });

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.game-card__actions')) return;
    if ((e.target as HTMLElement).closest('.game-card__favorite')) return;
    openDetailModal(game, onTagClick, onAuthorClick, onFavoriteChange);
  });

  return card;
}

// ----------------------------------------------------------------------------
// ゲームカードのボタン(プレイ・DL・削除)
// ----------------------------------------------------------------------------

export interface ActionsElements {
  actionsEl: HTMLElement;
  progressWrapEl?: HTMLElement;
  progressBarEl?: HTMLElement;
}

export function renderGameActions(
  els: ActionsElements,
  game: GameEntry,
  status: GameStatus,
  onStatusChange: (status: GameStatus) => void
) {
  const { actionsEl, progressWrapEl, progressBarEl } = els;
  actionsEl.innerHTML = '';

  if (game.type === 'web_link') {
    actionsEl.appendChild(makeButton('ブラウザで開く', () => playGame(game)));
    return;
  }

  if (status === 'not_downloaded') {
    const unsubBegin = subscribeBegin(game.id, () => {
      unsubBegin();
      onStatusChange('downloading');
    });
    actionsEl.appendChild(
      makeButton('ダウンロード', async (btn) => {
        btn.disabled = true;
        unsubBegin();
        onStatusChange('downloading');
        const success = await startDownload(game);
        onStatusChange(success ? 'downloaded' : 'not_downloaded');
      })
    );
  } else if (status === 'downloading') {
    const btn = makeButton('ダウンロード中…', () => {});
    btn.disabled = true;
    actionsEl.appendChild(btn);

    if (progressWrapEl) progressWrapEl.hidden = false;
    const current = getProgress(game.id);
    updateBar(current?.downloaded ?? 0, current?.total ?? 0);

    const unsubProgress = subscribeProgress(game.id, ({ downloaded, total }) =>
      updateBar(downloaded, total)
    );
    const unsubDone = subscribeDone(game.id, (result) => {
      unsubProgress();
      unsubDone();
      onStatusChange(result.success ? 'downloaded' : 'not_downloaded');
    });
  } else if (status === 'downloaded') {
    actionsEl.appendChild(makeButton('プレイ', () => playGame(game)));
    actionsEl.appendChild(makeButton('フォルダを開く', () => openGameFolder(game.id)));
    actionsEl.appendChild(
      makeButton(
        'アンインストール',
        async (btn) => {
          if (!confirm(`「${game.title}」をアンインストールしますか?`)) return;
          btn.disabled = true;
          try {
            await uninstallGame(game.id);
            onStatusChange('not_downloaded');
          } catch (err) {
            alert(`アンインストールに失敗しました: ${err}`);
            btn.disabled = false;
          }
        },
        'game-card__btn--danger'
      )
    );
  }

  function updateBar(downloaded: number, total: number) {
    if (!progressBarEl) return;
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    progressBarEl.style.width = `${pct}%`;
  }
}

function makeButton(
  label: string,
  onClick: (btn: HTMLButtonElement) => void,
  extraClass?: string
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = extraClass ? `game-card__btn ${extraClass}` : 'game-card__btn';
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

```
`src\gameModal.ts`:

```ts
import { type GameEntry, type GameStatus, thumbUrl, renderFolderSize, renderRemoteSize, hideFolderSize, escapeHtml } from './api';
import { getGameStatus, fetchThumbnailDataUrl } from './fromRust';
import { isFavorite, toggleFavorite, getNote, setNote, getPlayCount } from './localStore';
import { renderGameActions } from './gameCard';
import { isDownloading } from './downloadState';

// ----------------------------------------------------------------------------
// 詳細モーダル
// ----------------------------------------------------------------------------

export function openDetailModal(
  game: GameEntry,
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
) {
  const images = [game.thumbnail_path, ...(game.screenshot_paths ?? [])];
  let currentIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__carousel">
        <img class="modal__carousel-img" src="${thumbUrl(game.id, images[0])}" alt="${escapeHtml(game.title)}">
        <button class="modal__close" type="button" aria-label="閉じる">×</button>
        ${
          images.length > 1
            ? `
          <button class="modal__carousel-arrow modal__carousel-arrow--prev" type="button" aria-label="前の画像">‹</button>
          <button class="modal__carousel-arrow modal__carousel-arrow--next" type="button" aria-label="次の画像">›</button>
          <div class="modal__carousel-dots">
            ${images.map((_, i) => `<span class="modal__carousel-dot${i === 0 ? ' is-active' : ''}" data-index="${i}"></span>`).join('')}
          </div>
        `
            : ''
        }
      </div>

      <div class="modal__body">
        <div class="modal__header-row">
          <h2 class="modal__title">${escapeHtml(game.title)}</h2>
          <button class="modal__favorite-btn${isFavorite(game.id) ? ' is-active' : ''}" id="modal-favorite-btn" type="button">
            ${isFavorite(game.id) ? '♥ いいね！' : '♡ いいね！'}
          </button>
        </div>
        <p class="modal__author">作者: ${
          game.authors && game.authors.length > 0
            ? game.authors
                .map(
                  (a) =>
                    `<button class="modal__author-link" data-author="${escapeHtml(a)}" type="button">${escapeHtml(a)}</button>`
                )
                .join(', ')
            : '不明'
        }</p>
        <p class="modal__plays">▶ ${getPlayCount(game.id)}回</p>
        <p class="modal__size" id="modal-size" hidden></p>

        <div class="modal__progress" hidden>
          <div class="modal__progress-bar"></div>
        </div>
        <div class="modal__actions"></div>

        <div class="modal__tags">
          ${game.tags
            .map(
              (t) =>
                `<button class="game-card__tag game-card__tag--clickable" data-tag="${escapeHtml(t)}" type="button">${escapeHtml(t)}</button>`
            )
            .join('')}
        </div>
        <p class="modal__description">${escapeHtml(game.description)}</p>

        <div class="modal__notes">
          <label class="modal__notes-label" for="modal-note-textarea">プレイ後メモ(このPCだけに保存されます)</label>
          <textarea id="modal-note-textarea" class="modal__notes-textarea" placeholder="感想やクリアした日など、自由にメモ">${escapeHtml(getNote(game.id))}</textarea>
        </div>

        <button class="game-card__btn modal__share-btn" id="modal-share-btn" type="button">🖼 紹介画像を保存</button>
      </div>
    </div>
  `;

  // アクションボタンの初期化(ステータス取得は非同期。モーダル表示自体は待たない)
  function updateActions(status: GameStatus) {
    renderGameActions(
      {
        actionsEl: overlay.querySelector<HTMLElement>('.modal__actions')!,
        progressWrapEl: overlay.querySelector<HTMLElement>('.modal__progress')!,
        progressBarEl: overlay.querySelector<HTMLElement>('.modal__progress-bar')!,
      },
      game,
      status,
      updateActions
    );

    const sizeEl = overlay.querySelector<HTMLElement>('#modal-size')!;
    if (game.type === 'web_link') {
      hideFolderSize(sizeEl);
    } else if (status === 'downloaded') {
      renderFolderSize(sizeEl, game.id);
    } else if (game.archive_filename) {
      renderRemoteSize(sizeEl, game.id, game.archive_filename);
    } else {
      hideFolderSize(sizeEl);
    }
  }
  (async () => {
  const status: GameStatus =
    game.type === 'web_link'
      ? 'downloaded'
      : isDownloading(game.id)
        ? 'downloading'
        : await getGameStatus(game.id);
    updateActions(status);
  })();

  const carouselImg = overlay.querySelector<HTMLImageElement>('.modal__carousel-img')!;
  const dots = overlay.querySelectorAll<HTMLElement>('.modal__carousel-dot');

  function showSlide(index: number) {
    currentIndex = (index + images.length) % images.length;
    carouselImg.src = thumbUrl(game.id, images[currentIndex]);
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === currentIndex));
  }

  overlay.querySelector('.modal__carousel-arrow--prev')?.addEventListener('click', () => showSlide(currentIndex - 1));
  overlay.querySelector('.modal__carousel-arrow--next')?.addEventListener('click', () => showSlide(currentIndex + 1));
  dots.forEach((dot) => dot.addEventListener('click', () => showSlide(Number(dot.dataset.index))));

  carouselImg.addEventListener('click', () => openImagePreview(game.id, images[currentIndex]));

  overlay.querySelectorAll<HTMLButtonElement>('.modal__tags [data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onTagClick(btn.dataset.tag!);
      overlay.remove();
    });
  });

  overlay.querySelectorAll<HTMLButtonElement>('.modal__author [data-author]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onAuthorClick(btn.dataset.author!);
      overlay.remove();
    });
  });

  const favBtn = overlay.querySelector<HTMLButtonElement>('#modal-favorite-btn')!;
  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(game.id);
    favBtn.classList.toggle('is-active', nowFav);
    favBtn.textContent = nowFav ? '♥ いいね！' : '♡ いいね！';
    onFavoriteChange();
  });

  const noteTextarea = overlay.querySelector<HTMLTextAreaElement>('#modal-note-textarea')!;
  let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;
  noteTextarea.addEventListener('input', () => {
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => setNote(game.id, noteTextarea.value), 400);
  });

  const shareBtn = overlay.querySelector<HTMLButtonElement>('#modal-share-btn')!;
  shareBtn.addEventListener('click', async () => {
    shareBtn.disabled = true;
    const original = shareBtn.textContent;
    shareBtn.textContent = '生成中...';
    try {
      await shareGame(game);
    } catch (err) {
      alert(`紹介画像の生成に失敗しました: ${err}`);
    } finally {
      shareBtn.disabled = false;
      shareBtn.textContent = original;
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('.modal__close')!.addEventListener('click', () => overlay.remove());

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    } else if (e.key === 'ArrowLeft') {
      showSlide(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      showSlide(currentIndex + 1);
    }
  };
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
}

function openImagePreview(gameId: string, path: string) {
  const preview = document.createElement('div');
  preview.className = 'image-preview-overlay';
  preview.innerHTML = `<img class="image-preview-overlay__img" src="${thumbUrl(gameId, path)}">`;
  preview.addEventListener('click', () => preview.remove());
  document.body.appendChild(preview);
}

// ----------------------------------------------------------------------------
// 共有画像の生成
// ----------------------------------------------------------------------------

/** ゲーム1本分の紹介画像(サムネイル+タイトル+タグ)をCanvasで合成し、PNGとして保存する */
export async function shareGame(game: GameEntry): Promise<void> {
  const width = 1200;
  const height = 675; // 16:9

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvasの初期化に失敗しました');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  const dataUrl = await fetchThumbnailDataUrl(game.id, game.thumbnail_path);
  const img = await loadImage(dataUrl);
  drawImageCover(ctx, img, 0, 0, width, height * 0.72);

  const textAreaY = height * 0.72;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, textAreaY, width, height - textAreaY);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  wrapText(ctx, game.title, 32, textAreaY + 20, width - 64, 50, 2);

  ctx.font = '24px "Segoe UI", sans-serif';
  ctx.fillStyle = '#ccc';
  ctx.fillText(game.tags.map((t) => `#${t}`).join('  '), 32, textAreaY + 110, width - 64);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました'))), 'image/png');
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${game.title}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const chars = [...text];
  let line = '';
  const lines: string[] = [];
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

```
`src\listView.ts`:

```ts
import { type Campaign, type GameEntry, escapeHtml } from './api';
import { createGameCard } from './gameCard';
import { getGameStatus } from './fromRust';
import { startDownload } from './downloadState';

// ----------------------------------------------------------------------------
// キャンペーン一覧
// ----------------------------------------------------------------------------

export async function renderCampaigns(
  container: HTMLElement,
  campaigns: Campaign[],
  allGames: GameEntry[],
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
) {
  container.innerHTML = '';

  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const sections = campaigns
    .map((campaign) => ({
      campaign,
      games: campaign.game_ids.map((id) => gameMap.get(id)).filter((g): g is GameEntry => g !== undefined),
    }))
    .filter((s) => s.games.length > 0);

  if (sections.length === 0) {
    container.innerHTML = `<p class="empty-state">現在開催中のキャンペーンはありません。</p>`;
    return;
  }

  for (const { campaign, games } of sections) {
    const section = document.createElement('section');
    section.className = 'campaign-section';
    section.innerHTML = `
      <div class="campaign-section__header">
        <div>
          <h2 class="campaign-section__title">${escapeHtml(campaign.title)}</h2>
          ${campaign.description ? `<p class="campaign-section__description">${escapeHtml(campaign.description)}</p>` : ''}
        </div>
      </div>
    `;

    const downloadableGames = games.filter((g) => g.type === 'download');
    if (downloadableGames.length > 0) {
      const bulkBtn = document.createElement('button');
      bulkBtn.type = 'button';
      bulkBtn.className = 'campaign-section__download-all';
      bulkBtn.textContent = 'すべてダウンロード';
      bulkBtn.addEventListener('click', async () => {
        bulkBtn.disabled = true;
        const targets: GameEntry[] = [];
        for (const g of downloadableGames) {
          if ((await getGameStatus(g.id)) === 'not_downloaded') targets.push(g);
        }
        if (targets.length === 0) {
          bulkBtn.textContent = 'ダウンロード済みです';
          setTimeout(() => { bulkBtn.disabled = false; bulkBtn.textContent = 'すべてダウンロード'; }, 2000);
          return;
        }
        for (let i = 0; i < targets.length; i++) {
          bulkBtn.textContent = `ダウンロード中 (${i + 1}/${targets.length})`;
          await startDownload(targets[i]);
        }
        bulkBtn.textContent = 'すべてダウンロード完了';
        setTimeout(() => { bulkBtn.disabled = false; bulkBtn.textContent = 'すべてダウンロード'; }, 3000);
      });
      section.querySelector('.campaign-section__header')!.appendChild(bulkBtn);
        }

      const row = document.createElement('div');
      row.className = 'campaign-section__row';
      for (const game of games) {
        const card = await createGameCard(game, onTagClick, onAuthorClick, onFavoriteChange);
        row.appendChild(card);
      }

      section.appendChild(row);
      container.appendChild(section);
    }
}

// ----------------------------------------------------------------------------
// ページ送り
// ----------------------------------------------------------------------------

export function renderPagination(
  container: HTMLElement,
  currentPage: number,
  totalPages: number,
  onPageChange: (page: number) => void
) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const pages = buildPageList(currentPage, totalPages);
  const pageButtonsHtml = pages
    .map((p) =>
      p === '...'
        ? `<span class="pagination__ellipsis">…</span>`
        : `<button class="pagination__page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}" type="button" ${p === currentPage ? 'disabled' : ''}>${p}</button>`
    )
    .join('');

  container.innerHTML = `
    <button class="pagination__nav-btn" data-action="prev" type="button" ${currentPage <= 1 ? 'disabled' : ''}>‹ 前へ</button>
    <div class="pagination__pages">${pageButtonsHtml}</div>
    <button class="pagination__nav-btn" data-action="next" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>次へ ›</button>
  `;

  container.querySelectorAll<HTMLButtonElement>('.pagination__page-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
  container.querySelector('[data-action="prev"]')?.addEventListener('click', () => onPageChange(currentPage - 1));
  container.querySelector('[data-action="next"]')?.addEventListener('click', () => onPageChange(currentPage + 1));
}

/** 1, ..., current-1, current, current+1, ..., total の形式のページ番号リストを作る */
function buildPageList(current: number, total: number): (number | '...')[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const pages: (number | '...')[] = [1];

  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  if (total > 1) pages.push(total);

  return pages;
}

```
`src\localStore.ts`:

```ts
import type { GameEntry } from './api';

// ----------------------------------------------------------------------------
// 共通: localStorage の読み書き
// ----------------------------------------------------------------------------

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ----------------------------------------------------------------------------
// いいね!
// ----------------------------------------------------------------------------

const FAVORITES_KEY = 'cs-launcher-favorites';

function readFavorites(): Set<string> {
  const data = readJson(FAVORITES_KEY);
  return new Set(Array.isArray(data) ? data : []);
}

export function isFavorite(gameId: string): boolean {
  return readFavorites().has(gameId);
}

export function toggleFavorite(gameId: string): boolean {
  const ids = readFavorites();
  const nowFavorite = !ids.has(gameId);
  if (nowFavorite) ids.add(gameId);
  else ids.delete(gameId);
  writeJson(FAVORITES_KEY, [...ids]);
  return nowFavorite;
}

export function getFavoriteIds(): string[] {
  return [...readFavorites()];
}

// ----------------------------------------------------------------------------
// メモ
// ----------------------------------------------------------------------------

const NOTES_KEY = 'cs-launcher-notes';

function readNotes(): Record<string, string> {
  const data = readJson(NOTES_KEY);
  return data && typeof data === 'object' ? (data as Record<string, string>) : {};
}

export function getNote(gameId: string): string {
  return readNotes()[gameId] ?? '';
}

export function setNote(gameId: string, text: string) {
  const notes = readNotes();
  if (text.trim() === '') delete notes[gameId];
  else notes[gameId] = text;
  writeJson(NOTES_KEY, notes);
}

// ----------------------------------------------------------------------------
// 最近遊んだゲーム
// ----------------------------------------------------------------------------

const RECENT_KEY = 'cs-launcher-recently-played';
const RECENT_MAX_ENTRIES = 30;

interface PlayRecord {
  id: string;
  playedAt: number;
}

function readRecords(): PlayRecord[] {
  const data = readJson(RECENT_KEY);
  return Array.isArray(data) ? data : [];
}

/** ゲームを遊んだことを記録する。同じゲームの古い記録は削除し、先頭に積み直す */
export function recordPlay(gameId: string) {
  const records = readRecords().filter((r) => r.id !== gameId);
  records.unshift({ id: gameId, playedAt: Date.now() });
  writeJson(RECENT_KEY, records.slice(0, RECENT_MAX_ENTRIES));
}

/** 最近遊んだ順のゲームIDを返す */
export function getRecentlyPlayedIds(limit?: number): string[] {
  const ids = readRecords().map((r) => r.id);
  return limit ? ids.slice(0, limit) : ids;
}

// ----------------------------------------------------------------------------
// プレイ回数(/plays の行を、ゲームごと・期間ごとに合計する)
// ----------------------------------------------------------------------------

export type PlayPeriod = 'all' | 'month' | 'today';

export const PLAY_PERIODS: PlayPeriod[] = ['all', 'month', 'today'];

export const PLAY_PERIOD_LABELS: Record<PlayPeriod, string> = {
  all: '全期間',
  month: '1ヶ月',
  today: '今日',
};

export interface PlayRow {
  date: string; // 'YYYY-MM-DD'(JST)
  game_id: string;
  count: number;
}

export interface PlayCount {
  all: number;
  month: number;
  today: number;
}

const EMPTY: PlayCount = { all: 0, month: 0, today: 0 };

let counts = new Map<string, PlayCount>();
let period: PlayPeriod = 'all';

/** JST の日付 'YYYY-MM-DD'(Worker 側の集計と同じ基準)。offsetDays で前後にずらす */
function jstDate(offsetDays = 0): string {
  const t = Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

export function setPlayRows(rows: PlayRow[]): void {
  const today = jstDate();
  const monthStart = jstDate(-29); // 今日を含む30日間
  const next = new Map<string, PlayCount>();
  for (const r of rows) {
    const c = next.get(r.game_id) ?? { all: 0, month: 0, today: 0 };
    c.all += r.count;
    if (r.date >= monthStart) c.month += r.count;
    if (r.date === today) c.today += r.count;
    next.set(r.game_id, c);
  }
  counts = next;
}

export function getPlayCounts(gameId: string): PlayCount {
  return counts.get(gameId) ?? EMPTY;
}

export function getPlayCount(gameId: string, p: PlayPeriod = period): number {
  return getPlayCounts(gameId)[p];
}

/** このPCで遊んだ分を、画面に出す回数にもすぐ足す(サーバーの集計は最大1分遅れるため) */
export function bumpPlay(gameId: string): void {
  const c = counts.get(gameId) ?? { all: 0, month: 0, today: 0 };
  c.all++;
  c.month++;
  c.today++;
  counts.set(gameId, c);
}

export function getPlayPeriod(): PlayPeriod {
  return period;
}

export function setPlayPeriod(p: PlayPeriod): void {
  period = p;
}

// ----------------------------------------------------------------------------
// 並び替え
// ----------------------------------------------------------------------------

export type SortKey = 'default' | 'created' | 'updated' | 'year_desc' | 'year_asc' | 'plays';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: '標準' },
  { key: 'created', label: '新しい順(登録日)' },
  { key: 'updated', label: '更新順' },
  { key: 'year_desc', label: '年度順(新しい順)' },
  { key: 'year_asc', label: '年度順(古い順)' },
  { key: 'plays', label: 'プレイ回数順' },
];

/** 日付の文字列を新しい順に。値が無いものは最後に回す */
function dateDesc(a?: string, b?: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

/** 数値の比較。値が無いものは最後に回す */
function numCmp(a: number | undefined, b: number | undefined, desc: boolean): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return desc ? b - a : a - b;
}

/** 並び替えた新しい配列を返す。同じ値のものは元の順番を保つ。'default' は何もしない */
export function sortGames(games: GameEntry[], key: SortKey): GameEntry[] {
  if (key === 'default') return games;

  const compare = (a: GameEntry, b: GameEntry): number => {
    switch (key) {
      case 'created':
        return dateDesc(a.created_at, b.created_at);
      case 'updated':
        return dateDesc(a.updated_at, b.updated_at) || dateDesc(a.created_at, b.created_at);
      case 'year_desc':
        return numCmp(a.year, b.year, true) || dateDesc(a.created_at, b.created_at);
      case 'year_asc':
        return numCmp(a.year, b.year, false) || dateDesc(a.created_at, b.created_at);
      case 'plays':
        return getPlayCount(b.id) - getPlayCount(a.id);
    }
  };

  return games
    .map((game, index) => ({ game, index }))
    .sort((x, y) => compare(x.game, y.game) || x.index - y.index)
    .map((x) => x.game);
}

```
`src\main.ts`:

```ts
import { listCampaigns, listGames, listPlays, openGamesRootFolder } from './fromRust';
import { renderCampaigns, renderPagination } from './listView';
import { createGameCard } from './gameCard';
import { renderHeader, renderTopBar, type ViewType } from './topArea';
import { openDetailModal } from './gameModal';
import { getFavoriteIds, getRecentlyPlayedIds, setPlayPeriod, setPlayRows, sortGames, type PlayPeriod, type PlayRow, type SortKey } from './localStore';
import type { Campaign, GameEntry } from './api';
import './styles.css';
import { listen } from '@tauri-apps/api/event';


const PAGE_SIZE = 30;

let allGames: GameEntry[] = [];
let campaigns: Campaign[] | null = null;
let activeView: ViewType = 'all';
let activeTag: string | null = null;
let activeAuthor: string | null = null;
let titleQuery = '';
let currentPage = 1;
let activeYear: number | null = null;
let sortKey: SortKey = 'default';
let playPeriod: PlayPeriod = 'all';

async function init() {
  const appEl = document.querySelector<HTMLElement>('#app');
  const headerEl = document.querySelector<HTMLElement>('#header');
  const topBarEl = document.querySelector<HTMLElement>('#top-bar');
  const gridEl = document.querySelector<HTMLElement>('#game-grid');

  if (!appEl || !headerEl || !topBarEl || !gridEl) {
    console.error('#app / #header / #top-bar / #game-grid が見つかりません。index.htmlを確認してください。');
    return;
  }
  // init() の中、listGames() を呼ぶより前に追加
  await listen('remote-json-fallback', () => {
    if (document.querySelector('.offline-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.textContent = 'オフラインのため、前回取得した一覧を表示しています(最新ではない可能性があります)';
    document.body.insertAdjacentElement('afterbegin', banner);
  });

  // ページネーション用の要素(上下2箇所)。index.htmlに無ければ生成する
  let paginationTopEl = document.querySelector<HTMLElement>('#pagination-top');
  if (!paginationTopEl) {
    paginationTopEl = document.createElement('div');
    paginationTopEl.id = 'pagination-top';
    paginationTopEl.className = 'pagination';
    topBarEl.insertAdjacentElement('afterend', paginationTopEl);
  }

  let paginationBottomEl = document.querySelector<HTMLElement>('#pagination-bottom');
  if (!paginationBottomEl) {
    paginationBottomEl = document.createElement('div');
    paginationBottomEl.id = 'pagination-bottom';
    paginationBottomEl.className = 'pagination';
    gridEl.insertAdjacentElement('afterend', paginationBottomEl);
  }

  // #main の外(#appの最後)に灰色フッターを追加
  let footerEl = document.querySelector<HTMLElement>('#site-footer');
  if (!footerEl) {
    footerEl = document.createElement('footer');
    footerEl.id = 'site-footer';
    footerEl.className = 'site-footer';
    footerEl.textContent = '© クリエイティブスタッフ・ゲームランチャー';
    appEl.appendChild(footerEl);
  }

  renderHeader(headerEl, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);

  try {
    // プレイ回数が取れなくても、ゲーム一覧は出す
    const [games, plays] = await Promise.all([listGames(), listPlays().catch(() => [] as PlayRow[])]);
    allGames = games;
    setPlayRows(plays);
    await renderContent();
  } catch (err) {
    gridEl.innerHTML = `<p class="error">ゲーム一覧の取得に失敗しました: ${err}</p>`;
  }
  

  async function handleNavigate(view: ViewType) {
    activeView = view;
    activeTag = null;
    activeYear = null;
    activeAuthor = null;
    currentPage = 1;
    renderHeader(headerEl!, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);
    await renderContent();
  }

  async function handleOpenGamesFolder() {
    try {
      await openGamesRootFolder();
    } catch (err) {
      alert(`フォルダを開けませんでした: ${err}`);
    }
  }

  function handleGacha() {
    if (allGames.length === 0) return;
    const game = allGames[Math.floor(Math.random() * allGames.length)];
    openDetailModal(game, handleTagClick, handleAuthorClick, handleFavoriteChange);
  }

  async function handleFavoriteChange() {
    await renderContent();
  }

  async function switchToAllViewIfNeeded() {
    if (activeView !== 'all') {
      activeView = 'all';
      renderHeader(headerEl!, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);
    }
  }

  async function handleTagClick(tag: string | null) {
    await switchToAllViewIfNeeded();
    activeTag = tag;
    currentPage = 1;
    await renderContent();
  }

  async function handleAuthorClick(author: string | null) {
    await switchToAllViewIfNeeded();
    activeAuthor = author;
    currentPage = 1;
    await renderContent();
  }

  async function handleTitleQueryChange(query: string) {
    titleQuery = query;
    currentPage = 1;
    await renderContent();
  }

  async function handleYearClick(year: number | null) {
    activeYear = year;
    currentPage = 1;
    await renderContent();
  }

  async function handleSortChange(key: SortKey) {
    sortKey = key;
    currentPage = 1;
    await renderContent();
  }

  async function handlePeriodChange(period: PlayPeriod) {
    playPeriod = period;
    setPlayPeriod(period); // カードに出す回数の期間
    await renderContent();
  }

  async function handlePageChange(page: number) {
    currentPage = page;
    await renderContent();
  }

  function getBaseGames(): GameEntry[] {
    if (activeView === 'favorites') {
      const favIds = new Set(getFavoriteIds());
      return allGames.filter((g) => favIds.has(g.id));
    }
    if (activeView === 'recent') {
      const recentIds = getRecentlyPlayedIds();
      const gameMap = new Map(allGames.map((g) => [g.id, g]));
      return recentIds.map((id) => gameMap.get(id)).filter((g): g is GameEntry => g !== undefined);
    }
    return allGames;
  }

  async function renderContent() {
    if (activeView === 'campaign') {
      topBarEl!.innerHTML = '';
      paginationTopEl!.hidden = true;
      paginationBottomEl!.hidden = true;
      gridEl!.className = 'content-area content-area--campaign';
      gridEl!.innerHTML = '<p class="empty-state">読み込み中...</p>';
      try {
        if (campaigns === null) {
          campaigns = await listCampaigns();
        }
        await renderCampaigns(gridEl!, campaigns, allGames, handleTagClick, handleAuthorClick, handleFavoriteChange);
      } catch (err) {
        gridEl!.innerHTML = `<p class="error">キャンペーン情報の取得に失敗しました: ${err}</p>`;
      }
      return;
    }

    gridEl!.className = 'content-area content-area--grid';

    const baseGames = getBaseGames();
    let visibleGames = activeTag ? baseGames.filter((g) => g.tags.includes(activeTag!)) : baseGames;
    if (activeAuthor) {
      visibleGames = visibleGames.filter((g) => (g.authors ?? []).includes(activeAuthor!));
    }
    if (titleQuery.trim() !== '') {
      const q = titleQuery.trim().toLowerCase();
      visibleGames = visibleGames.filter(
        (g) => g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)
      );
    }

    if (activeYear !== null) {
      visibleGames = visibleGames.filter((g) => g.year === activeYear);
    }
    visibleGames = sortGames(visibleGames, sortKey);

    const totalPages = Math.max(1, Math.ceil(visibleGames.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const pagedGames = visibleGames.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const activeEl = document.activeElement as HTMLInputElement | null;
    const wasTitleInputFocused = activeEl?.classList.contains('top-bar__title-search') ?? false;
    const caret = wasTitleInputFocused ? activeEl!.selectionStart : null;

    renderTopBar(
      topBarEl!,
      baseGames,
      activeTag,
      activeAuthor,
      titleQuery,
      handleTagClick,
      handleAuthorClick,
      handleTitleQueryChange,
      activeYear,
      sortKey,
      playPeriod,
      handleYearClick,
      handleSortChange,
      handlePeriodChange
    );

    if (wasTitleInputFocused) {
      const input = topBarEl!.querySelector<HTMLInputElement>('.top-bar__title-search');
      input?.focus();
      if (caret !== null) input?.setSelectionRange(caret, caret);
    }

    gridEl!.innerHTML = '';
    if (visibleGames.length === 0) {
      const emptyMsg =
        activeView === 'favorites'
          ? 'いいね!はまだありません。ゲーム詳細の♡ボタンで追加できます。'
          : activeView === 'recent'
          ? 'まだ遊んだゲームがありません。'
          : '該当するゲームがありません。';
      gridEl!.innerHTML = `<p class="empty-state">${emptyMsg}</p>`;
      renderPagination(paginationTopEl!, 1, 1, handlePageChange);
      renderPagination(paginationBottomEl!, 1, 1, handlePageChange);
      return;
    }
    for (const game of pagedGames) {
      const card = await createGameCard(game, handleTagClick, handleAuthorClick, handleFavoriteChange);
      gridEl!.appendChild(card);
    }

    renderPagination(paginationTopEl!, currentPage, totalPages, handlePageChange);
    renderPagination(paginationBottomEl!, currentPage, totalPages, handlePageChange);
  }
}

window.addEventListener('DOMContentLoaded', init);

```
`src\topArea.ts`:

```ts
import { type GameEntry, escapeHtml } from './api';
import { PLAY_PERIODS, PLAY_PERIOD_LABELS, SORT_OPTIONS, type PlayPeriod, type SortKey } from './localStore';

// ----------------------------------------------------------------------------
// ヘッダー(タブとボタン)
// ----------------------------------------------------------------------------

export type ViewType = 'campaign' | 'all' | 'favorites' | 'recent';

export function renderHeader(
  container: HTMLElement,
  activeView: ViewType,
  onNavigate: (view: ViewType) => void,
  onOpenGamesFolder: () => void,
  onGacha: () => void
) {
  container.innerHTML = `
    <div class="header__top">
      <div class="header__inner">
        <div class="header__logo">クリエイティブスタッフ・ゲームランチャー</div>
        <div class="header__actions">
          <button class="header__action-btn header__action-btn--gacha" id="gacha-btn" type="button">ゲームガチャ</button>
          <button class="header__action-btn header__action-btn--folder" id="open-games-folder-btn" type="button">ゲームフォルダを開く</button>
        </div>
      </div>
    </div>
    <nav class="header__nav">
      <div class="header__inner header__inner--nav">
        <button class="header__nav-item${activeView === 'campaign' ? ' is-active' : ''}" data-view="campaign" type="button">キャンペーン</button>
        <button class="header__nav-item${activeView === 'all' ? ' is-active' : ''}" data-view="all" type="button">ゲーム一覧</button>
        <button class="header__nav-item${activeView === 'favorites' ? ' is-active' : ''}" data-view="favorites" type="button">♡ いいね！</button>
        <button class="header__nav-item${activeView === 'recent' ? ' is-active' : ''}" data-view="recent" type="button">最近遊んだ</button>
      </div>
    </nav>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => onNavigate(btn.dataset.view as ViewType));
  });

  container.querySelector('#gacha-btn')!.addEventListener('click', onGacha);
  container.querySelector('#open-games-folder-btn')!.addEventListener('click', onOpenGamesFolder);
}

// ----------------------------------------------------------------------------
// 上部バー(タグ・作者・検索)
// ----------------------------------------------------------------------------

export function renderTopBar(
  container: HTMLElement,
  games: GameEntry[],
  activeTag: string | null,
  activeAuthor: string | null,
  titleQuery: string,
  onTagClick: (tag: string | null) => void,
  onAuthorClick: (author: string | null) => void,
  onTitleQueryChange: (query: string) => void,
  activeYear: number | null,
  sortKey: SortKey,
  period: PlayPeriod,
  onYearClick: (year: number | null) => void,
  onSortChange: (key: SortKey) => void,
  onPeriodChange: (period: PlayPeriod) => void
) {
  const tagCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  for (const game of games) {
    for (const tag of game.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const authors = (game.authors ?? []).map((a) => a.trim()).filter((a) => a !== '');
    for (const author of authors) {
      authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    }
  }
  const yearCounts = new Map<number, number>();
  for (const game of games) {
    if (game.year !== undefined) yearCounts.set(game.year, (yearCounts.get(game.year) ?? 0) + 1);
  }
  const years = [...yearCounts.entries()].sort((a, b) => b[0] - a[0]); // 新しい年が先頭

  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (activeTag) {
    const idx = tags.findIndex(([t]) => t === activeTag);
    if (idx > 0) {
      tags.unshift(tags.splice(idx, 1)[0]);
    }
  }

  const authors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (activeAuthor) {
    const idx = authors.findIndex(([a]) => a === activeAuthor);
    if (idx > 0) {
      authors.unshift(authors.splice(idx, 1)[0]);
    }
  }

  container.innerHTML = `
    <div class="top-bar__row">
      <div class="top-bar__count">${games.length}件のゲーム</div>
      <div class="top-bar__controls">
        <select class="top-bar__select" id="sort-select" aria-label="並び替え">
          ${SORT_OPTIONS.map((o) => `<option value="${o.key}"${o.key === sortKey ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
        <select class="top-bar__select" id="period-select" aria-label="プレイ回数の期間">
          ${PLAY_PERIODS.map((p) => `<option value="${p}"${p === period ? ' selected' : ''}>プレイ回数: ${PLAY_PERIOD_LABELS[p]}</option>`).join('')}
        </select>
        <input
          class="top-bar__title-search"
          type="text"
          placeholder="タイトル・説明で検索"
          value="${escapeAttr(titleQuery)}"
        >
      </div>
    </div>
    ${
      years.length > 0
        ? `
      <div class="top-bar__section-label">年</div>
      <div class="top-bar__chips">
        ${years
          .map(
            ([year, count]) => `
          <button class="top-bar__chip${year === activeYear ? ' is-active' : ''}" data-year="${year}" type="button">
            ${year} <span class="top-bar__chip-count">${count}</span>
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }
    ${
      tags.length > 0
        ? `
      <div class="top-bar__section-label">タグ</div>
      <div class="top-bar__chips">
        ${tags
          .map(
            ([tag, count]) => `
          <button class="top-bar__chip${tag === activeTag ? ' is-active' : ''}" data-tag="${escapeAttr(tag)}" type="button">
            ${escapeHtml(tag)} <span class="top-bar__chip-count">${count}</span>
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }
    ${
      authors.length > 0
        ? `
      <div class="top-bar__section-label">作者</div>
      <div class="top-bar__chips">
        ${authors
          .map(
            ([author, count]) => `
          <button class="top-bar__chip${author === activeAuthor ? ' is-active' : ''}" data-author="${escapeAttr(author)}" type="button">
            ${escapeHtml(author)} <span class="top-bar__chip-count">${count}</span>
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }
  `;

  container.querySelectorAll<HTMLButtonElement>('.top-bar__chip[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onTagClick(btn.dataset.tag === activeTag ? null : btn.dataset.tag!);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.top-bar__chip[data-author]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onAuthorClick(btn.dataset.author === activeAuthor ? null : btn.dataset.author!);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.top-bar__chip[data-year]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const year = Number(btn.dataset.year);
      onYearClick(year === activeYear ? null : year);
    });
  });

  container.querySelector<HTMLSelectElement>('#sort-select')!.addEventListener('change', (e) => {
    onSortChange((e.target as HTMLSelectElement).value as SortKey);
  });
  container.querySelector<HTMLSelectElement>('#period-select')!.addEventListener('change', (e) => {
    onPeriodChange((e.target as HTMLSelectElement).value as PlayPeriod);
  });

  const titleInput = container.querySelector<HTMLInputElement>('.top-bar__title-search')!;
  titleInput.addEventListener('input', (e) => {
    // IME変換中(isComposing)はここでは反映しない。再描画すると変換状態が壊れるため。
    if ((e as InputEvent).isComposing) return;
    onTitleQueryChange(titleInput.value);
  });
  titleInput.addEventListener('compositionend', () => {
    // 変換確定時に改めて反映する
    onTitleQueryChange(titleInput.value);
  });
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}


```