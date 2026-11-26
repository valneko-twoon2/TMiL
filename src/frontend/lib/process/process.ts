// プロセス一覧の集計・検索・並べ替え。
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

/** 表示名（Windows の `.exe` は外す）。 */
export function displayName(name: string): string {
  return name.replace(/\.exe$/i, '');
}

/** 実行ファイル名ごとにまとめる。 */
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

/** 名前・PID・ユーザー・コマンドラインで絞り込む（大文字小文字は区別しない）。 */
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

/** 列見出しを押したときの次の並び順。同じ列なら向きを反転、違う列なら数値は降順・文字は昇順で始める。 */
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

/** 値の取り出し方を渡して並べ替える（元の配列は変えない、同値は元の順を保つ）。 */
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
