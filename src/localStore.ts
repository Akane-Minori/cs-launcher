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
