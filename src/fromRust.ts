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

/** 端末に入っているゲームの版を返す。記録が無ければ null */
export async function getInstalledVersion(gameId: string): Promise<string | null> {
  return invoke<string | null>('get_installed_version', { gameId });
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
      version: game.version ?? '',
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

// ----------------------------------------------------------------------------
// ランチャー本体の自己アップデート
// ----------------------------------------------------------------------------

export interface LauncherUpdate {
  current: string; // 今動いている版
  latest: string; // R2 にある新しい版
  filename: string; // launcher/ 配下の新exeのファイル名
}

/** "0.2.0" のような版を数字ごとに比べ、latest が current より新しいかを返す */
function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** launcher/version.json を見て、今の版より新しければ情報を返す。新しくなければ null */
export async function checkLauncherUpdate(): Promise<LauncherUpdate | null> {
  const [current, text] = await Promise.all([
    invoke<string>('get_launcher_version'),
    invoke<string>('fetch_remote_json', { path: 'launcher/version.json' }),
  ]);
  const data = JSON.parse(text) as { version?: string; filename?: string };
  if (!data.version || !data.filename) return null;
  if (!isNewerVersion(data.version, current)) return null;
  return { current, latest: data.version, filename: data.filename };
}

/**
 * 新しいランチャーをダウンロードして差し替え、再起動する。
 * 成功するとアプリが終了するので、この関数は通常戻ってこない。
 */
export async function selfUpdate(
  filename: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  const unlisten = await listen<[number, number]>('self-update-progress', (event) => {
    const [downloaded, total] = event.payload;
    onProgress(downloaded, total);
  });
  try {
    await invoke('self_update', { filename });
  } finally {
    unlisten();
  }
}
