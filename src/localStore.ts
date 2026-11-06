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
