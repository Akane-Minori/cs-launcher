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