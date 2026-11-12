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

