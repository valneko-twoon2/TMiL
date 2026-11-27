// ユーザーごとにプロセスをまとめる（純粋関数）。ユーザーのページに使う。
import { formatBytes, formatPercent, formatRate } from '../format/format';
import { heatLevel, rateLevel, shareOf } from '../format/heat';
import type { ProcessInfo } from '../model/types';
import type { TableColumn } from '../table/table';

export interface UserRow {
  /** 並べ替えや選択に使う鍵（ユーザー名。分からないものは空） */
  key: string;
  name: string;
  /** 使っているセッション ID（小さい順） */
  sessions: number[];
  processes: ProcessInfo[];
  cpu: number;
  memory: number;
  diskPerSec: number;
  gpu: number;
}

/** ユーザー名が分からないプロセスの行の名前。 */
export const UNKNOWN_USER = '（不明）';

/** ユーザーごとにまとめる。CPU と GPU は 100 を超えない。 */
export function groupByUser(processes: readonly ProcessInfo[]): UserRow[] {
  const users = new Map<string, UserRow>();
  for (const p of processes) {
    let row = users.get(p.user);
    if (!row) {
      row = {
        key: p.user,
        name: p.user === '' ? UNKNOWN_USER : p.user,
        sessions: [],
        processes: [],
        cpu: 0,
        memory: 0,
        diskPerSec: 0,
        gpu: 0,
      };
      users.set(p.user, row);
    }
    row.processes.push(p);
    row.cpu += p.cpu;
    row.memory += p.memory;
    row.diskPerSec += p.diskReadPerSec + p.diskWrittenPerSec;
    row.gpu += p.gpu ?? 0;
    if (p.sessionId !== null && !row.sessions.includes(p.sessionId)) row.sessions.push(p.sessionId);
  }
  for (const row of users.values()) {
    row.cpu = Math.min(100, row.cpu);
    row.gpu = Math.min(100, row.gpu);
    row.sessions.sort((a, b) => a - b);
  }
  return [...users.values()];
}

/** ユーザー名で絞り込む（大文字小文字は区別しない）。 */
export function filterUsers(rows: readonly UserRow[], query: string): UserRow[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(q));
}

/** ユーザーの表の列。 */
export function userColumns(memoryTotal: number): TableColumn<UserRow>[] {
  return [
    { key: 'name', label: 'ユーザー', width: 220, value: (u) => u.name },
    { key: 'sessions', label: 'セッション', width: 90, value: (u) => u.sessions.join(', ') },
    { key: 'count', label: 'プロセス', numeric: true, width: 80, value: (u) => u.processes.length },
    {
      key: 'cpu',
      label: 'CPU',
      numeric: true,
      width: 80,
      value: (u) => u.cpu,
      text: (u) => formatPercent(u.cpu),
      heat: (u) => heatLevel(u.cpu),
    },
    {
      key: 'memory',
      label: 'メモリ',
      numeric: true,
      width: 110,
      value: (u) => u.memory,
      text: (u) => formatBytes(u.memory),
      heat: (u) => heatLevel(shareOf(u.memory, memoryTotal)),
    },
    {
      key: 'disk',
      label: 'ディスク',
      numeric: true,
      width: 110,
      value: (u) => u.diskPerSec,
      text: (u) => formatRate(u.diskPerSec),
      heat: (u) => rateLevel(u.diskPerSec),
    },
    {
      key: 'gpu',
      label: 'GPU',
      numeric: true,
      width: 80,
      value: (u) => u.gpu,
      text: (u) => formatPercent(u.gpu),
      heat: (u) => heatLevel(u.gpu),
    },
  ];
}
