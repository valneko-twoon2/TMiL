// プロセス表・詳細表の列定義と選択状態。
import { formatBytes, formatDateTime, formatPercent, formatRate, formatUptime } from '../format/format';
import { processStateLabel } from '../format/labels';
import type { KillTarget, ProcessInfo } from '../model/types';
import type { ProcessGroup } from './process';

export type GroupColumn = 'name' | 'cpu' | 'memory' | 'disk';
export const GROUP_NUMERIC: readonly GroupColumn[] = ['cpu', 'memory', 'disk'];

/** プロセス タブの並べ替えに使う値。 */
export function groupValue(group: ProcessGroup, column: GroupColumn): string | number {
  switch (column) {
    case 'name':
      return group.name;
    case 'cpu':
      return group.cpu;
    case 'memory':
      return group.memory;
    case 'disk':
      return group.diskPerSec;
  }
}

/** 詳細タブで選べる列（この順に並ぶ）。名前は外せない。 */
export const DETAIL_COLUMNS = [
  { key: 'name', label: '名前', numeric: false },
  { key: 'pid', label: 'PID', numeric: true },
  { key: 'state', label: '状態', numeric: false },
  { key: 'user', label: 'ユーザー名', numeric: false },
  { key: 'cpu', label: 'CPU', numeric: true },
  { key: 'memory', label: 'メモリ', numeric: true },
  { key: 'disk', label: 'ディスク', numeric: true },
  { key: 'diskRead', label: 'ディスク読み取り', numeric: true },
  { key: 'diskWrite', label: 'ディスク書き込み', numeric: true },
  { key: 'parentPid', label: '親 PID', numeric: true },
  { key: 'runTime', label: '稼働時間', numeric: true },
  { key: 'startTime', label: '開始時刻', numeric: true },
  { key: 'exe', label: 'イメージ パス名', numeric: false },
  { key: 'command', label: 'コマンドライン', numeric: false },
] as const;

export type DetailColumn = (typeof DETAIL_COLUMNS)[number]['key'];
export const DETAIL_NUMERIC: readonly DetailColumn[] = DETAIL_COLUMNS.filter((c) => c.numeric).map(
  (c) => c.key,
);
/** 外せない列。 */
export const REQUIRED_DETAIL_COLUMN: DetailColumn = 'name';
/** 最初に出す列（本家の既定に近いもの）。 */
export const DEFAULT_DETAIL_COLUMNS: readonly DetailColumn[] = [
  'name',
  'pid',
  'state',
  'user',
  'cpu',
  'memory',
  'disk',
  'command',
];

/** 列の見出し。 */
export function detailLabel(column: DetailColumn): string {
  return DETAIL_COLUMNS.find((c) => c.key === column)?.label ?? column;
}

/** 列ごとの、並べ替えに使う値と、セルに出す文字。 */
const DETAIL_CELLS: Record<
  DetailColumn,
  { value: (p: ProcessInfo) => string | number; text?: (p: ProcessInfo) => string }
> = {
  name: { value: (p) => p.name },
  pid: { value: (p) => p.pid },
  state: { value: (p) => p.state, text: (p) => processStateLabel(p.state) },
  user: { value: (p) => p.user },
  cpu: { value: (p) => p.cpu, text: (p) => formatPercent(p.cpu) },
  memory: { value: (p) => p.memory, text: (p) => formatBytes(p.memory) },
  disk: {
    value: (p) => p.diskReadPerSec + p.diskWrittenPerSec,
    text: (p) => formatRate(p.diskReadPerSec + p.diskWrittenPerSec),
  },
  diskRead: { value: (p) => p.diskReadPerSec, text: (p) => formatRate(p.diskReadPerSec) },
  diskWrite: { value: (p) => p.diskWrittenPerSec, text: (p) => formatRate(p.diskWrittenPerSec) },
  // 親が無いものは並べ替えで先頭に来るよう -1 にする
  parentPid: {
    value: (p) => p.parentPid ?? -1,
    text: (p) => (p.parentPid === null ? '' : String(p.parentPid)),
  },
  runTime: { value: (p) => p.runTimeSecs, text: (p) => formatUptime(p.runTimeSecs) },
  startTime: { value: (p) => p.startTime, text: (p) => formatDateTime(p.startTime) },
  exe: { value: (p) => p.exe },
  command: { value: (p) => p.command },
};

/** 詳細タブの並べ替えに使う値。 */
export function detailValue(p: ProcessInfo, column: DetailColumn): string | number {
  return DETAIL_CELLS[column].value(p);
}

/** 詳細タブのセルに出す文字。 */
export function detailText(p: ProcessInfo, column: DetailColumn): string {
  const cell = DETAIL_CELLS[column];
  return cell.text ? cell.text(p) : String(cell.value(p));
}

/**
 * 保存されていた列の指定を読む。知らない列や重複は除き、名前の列は必ず入れ、決まった順に並べる。
 * 配列でなければ既定の列にする。
 */
export function normalizeDetailColumns(value: unknown): DetailColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_DETAIL_COLUMNS];
  const wanted = new Set<unknown>(value);
  wanted.add(REQUIRED_DETAIL_COLUMN);
  return DETAIL_COLUMNS.map((c) => c.key).filter((key) => wanted.has(key));
}

/** 列の表示・非表示を切り替える。名前の列は外せない。 */
export function toggleDetailColumn(visible: readonly DetailColumn[], column: DetailColumn): DetailColumn[] {
  if (column === REQUIRED_DETAIL_COLUMN) return normalizeDetailColumns(visible);
  const next = visible.includes(column) ? visible.filter((c) => c !== column) : [...visible, column];
  return normalizeDetailColumns(next);
}

/** 表で選んでいるもの。 */
export type Selection = { kind: 'group'; key: string } | { kind: 'process'; pid: number } | null;

/** プロセスを終了の指定に変える。 */
export function toKillTarget(p: ProcessInfo): KillTarget {
  return { pid: p.pid, startTime: p.startTime };
}

/** 選択から終了対象を求める。今の一覧に無いものは対象にしない。 */
export function selectedTargets(selection: Selection, groups: readonly ProcessGroup[]): KillTarget[] {
  if (selection === null) return [];
  if (selection.kind === 'group') {
    return groups.find((g) => g.key === selection.key)?.children.map(toKillTarget) ?? [];
  }
  const found = groups.flatMap((g) => g.children).find((p) => p.pid === selection.pid);
  return found ? [toKillTarget(found)] : [];
}
