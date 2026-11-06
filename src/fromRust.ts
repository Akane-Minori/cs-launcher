import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Campaign, GameEntry, GameStatus } from './api';
import { recordPlay } from './localStore';


export async function listGames(): Promise<GameEntry[]> {
  const text = await invoke<string>('fetch_remote_json', { path: 'games.json' });
  return JSON.parse(text);
}

export async function listCampaigns(): Promise<Campaign[]> {
  const text = await invoke<string>('fetch_remote_json', { path: 'campaigns.json' });
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
    return;
  }

  if (!game.exe_relative_path) {
    throw new Error('exe_relative_pathが設定されていません');
  }
  await invoke('launch_game', {
    gameId: game.id,
    exeRelativePath: game.exe_relative_path,
  });
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