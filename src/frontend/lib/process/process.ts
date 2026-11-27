import type { ProcessInfo } from '../model/types';

/** 同じ実行ファイル名のプロセスをまとめた行。 */
export interface ProcessGroup {
  key: string;
  name: string;
  pids: number[];
  cpu: number;
  memory: number;
  diskPerSec: number;
  children: ProcessInfo[];
}

export function displayName(name: string): string {
  return name.replace(/\.exe$/i, '');
}

export function groupProcesses(processes: readonly ProcessInfo[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();
  for (const p of processes) {
    const key = p.name.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { key, name: displayName(p.name), pids: [], cpu: 0, memory: 0, diskPerSec: 0, children: [] };
      groups.set(key, group);
    }
    group.pids.push(p.pid);
    group.cpu += p.cpu;
    group.memory += p.memory;
    group.diskPerSec += p.diskReadPerSec + p.diskWrittenPerSec;
    group.children.push(p);
  }
  for (const g of groups.values()) {
    g.cpu = Math.min(100, g.cpu);
    g.children.sort((a, b) => a.pid - b.pid);
  }
  return [...groups.values()];
}

export function filterProcesses(processes: readonly ProcessInfo[], query: string): ProcessInfo[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...processes];
  return processes.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      String(p.pid) === q ||
      p.user.toLowerCase().includes(q) ||
      p.command.toLowerCase().includes(q),
  );
}

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function nextSort<K extends string>(
  current: SortState<K>,
  key: K,
  numericKeys: readonly K[],
): SortState<K> {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: numericKeys.includes(key) ? 'desc' : 'asc' };
}

type Value = string | number | null;

function compareValues(a: Value, b: Value): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ja', { numeric: true, sensitivity: 'base' });
}

export function sortBy<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  pick: (row: T, key: K) => Value,
): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => sign * compareValues(pick(x.row, sort.key), pick(y.row, sort.key)) || x.index - y.index)
    .map(({ row }) => row);
}

/**
 * 前の並びを保つ（本家と同じく、値が変わっても行は動かさない）。
 * 前にあった行はその順のまま、新しく出てきた行は `sorted` での位置に差し込む。
 */
export function keepOrder<T>(
  sorted: readonly T[],
  previous: readonly string[],
  keyOf: (row: T) => string,
): T[] {
  const byKey = new Map(sorted.map((row) => [keyOf(row), row]));
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const key of previous) {
    const row = byKey.get(key);
    if (row === undefined || seen.has(key)) continue;
    kept.push(row);
    seen.add(key);
  }
  sorted.forEach((row, index) => {
    if (!seen.has(keyOf(row))) kept.splice(Math.min(index, kept.length), 0, row);
  });
  return kept;
}

/** 並べ替えの基準が変わるまで前の並びを保つ。`$derived` の中で使うので、反応しない値で持つ。 */
export class StableOrder<T> {
  #keys: readonly string[] = [];
  #sort = '';
  readonly #keyOf: (row: T) => string;

  constructor(keyOf: (row: T) => string) {
    this.#keyOf = keyOf;
  }

  /** 行の鍵ごとの位置。 */
  next(sorted: readonly T[], sort: SortState<string>): ReadonlyMap<string, number> {
    const by = `${sort.key}:${sort.direction}`;
    const rows = by === this.#sort ? keepOrder(sorted, this.#keys, this.#keyOf) : sorted;
    this.#keys = rows.map((row) => this.#keyOf(row));
    this.#sort = by;
    return new Map(this.#keys.map((key, index) => [key, index]));
  }
}
