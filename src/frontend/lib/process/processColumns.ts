// プロセス タブの列（見出しの右クリックで選べる）と、種類（アプリ・バックグラウンド・Windows プロセス）の分け方。
import { formatBytes, formatPercent, formatRate } from '../format/format';
import { heatLevel, rateLevel, shareOf } from '../format/heat';
import { processStatusBadge } from '../format/labels';
import type { ProcessInfo } from '../model/types';
import { displayName, type ProcessGroup } from './process';

export type ProcessKind = 'app' | 'background' | 'system';
export const PROCESS_KINDS: readonly ProcessKind[] = ['app', 'background', 'system'];

/** 種類の名前。本家の Windows では「Windows プロセス」、Linux では OS のプロセスとして出す。 */
export function kindLabel(kind: ProcessKind, windows: boolean): string {
  if (kind === 'app') return 'アプリ';
  if (kind === 'background') return 'バックグラウンド プロセス';
  return windows ? 'Windows プロセス' : 'システム プロセス';
}

const WINDOWS_DIR = /^[a-z]:\\windows\\/i;

/** OS のプロセスか（Windows: 実行ファイルが Windows フォルダーにあるか不明なもの。Linux: root か不明なもの）。 */
export function isSystemProcess(p: ProcessInfo, windows: boolean): boolean {
  if (p.exe === '') return true;
  return windows ? WINDOWS_DIR.test(p.exe) : p.user === 'root';
}

/** まとめた行の種類。ウィンドウを出しているものがあればアプリ、全部 OS のものなら OS のプロセス。 */
export function processKind(
  group: ProcessGroup,
  windowPids: ReadonlySet<number>,
  windows: boolean,
): ProcessKind {
  if (group.children.some((c) => windowPids.has(c.pid))) return 'app';
  if (group.children.every((c) => isSystemProcess(c, windows))) return 'system';
  return 'background';
}

export interface KindSection {
  kind: ProcessKind;
  groups: ProcessGroup[];
}

/** 種類ごとに分ける（本家と同じ順。空の種類は出さない）。中の順は渡した順のまま。 */
export function sectionsOf(
  groups: readonly ProcessGroup[],
  kindOf: (group: ProcessGroup) => ProcessKind,
): KindSection[] {
  return PROCESS_KINDS.map((kind) => ({ kind, groups: groups.filter((g) => kindOf(g) === kind) })).filter(
    (s) => s.groups.length > 0,
  );
}

/** プロセス タブで選べる列（この順に並ぶ）。名前は外せない。 */
export const PROCESS_COLUMNS = [
  { key: 'name', label: '名前', numeric: false },
  { key: 'type', label: '種類', numeric: false },
  { key: 'status', label: '状態', numeric: false },
  { key: 'publisher', label: '発行元', numeric: false },
  { key: 'pid', label: 'PID', numeric: true },
  { key: 'processName', label: 'プロセス名', numeric: false },
  { key: 'command', label: 'コマンド ライン', numeric: false },
  { key: 'cpu', label: 'CPU', numeric: true },
  { key: 'memory', label: 'メモリ', numeric: true },
  { key: 'disk', label: 'ディスク', numeric: true },
  { key: 'gpu', label: 'GPU', numeric: true },
] as const;

export type ProcessColumn = (typeof PROCESS_COLUMNS)[number]['key'];
export const PROCESS_NUMERIC: readonly ProcessColumn[] = PROCESS_COLUMNS.filter((c) => c.numeric).map(
  (c) => c.key,
);
export const DEFAULT_PROCESS_COLUMNS: readonly ProcessColumn[] = ['name', 'status', 'cpu', 'memory', 'disk'];

export function processColumnLabel(column: ProcessColumn): string {
  return PROCESS_COLUMNS.find((c) => c.key === column)?.label ?? column;
}

/** 保存されていた列を読む。知らない列や重複は除き、名前は必ず入れ、決まった順に並べる。 */
export function normalizeProcessColumns(value: unknown): ProcessColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROCESS_COLUMNS];
  const wanted = new Set<unknown>(value);
  wanted.add('name');
  return PROCESS_COLUMNS.map((c) => c.key).filter((key) => wanted.has(key));
}

/** 列の表示・非表示を切り替える。名前の列は外せない。 */
export function toggleProcessColumn(
  visible: readonly ProcessColumn[],
  column: ProcessColumn,
): ProcessColumn[] {
  if (column === 'name') return normalizeProcessColumns(visible);
  const next = visible.includes(column) ? visible.filter((c) => c !== column) : [...visible, column];
  return normalizeProcessColumns(next);
}

/** 行の文字や色を決めるのに使う、プロセスの外の情報。 */
export interface ProcessCellContext {
  kind: (group: ProcessGroup) => ProcessKind;
  windows: boolean;
  description: (exe: string) => string;
  company: (exe: string) => string;
  marks: (p: ProcessInfo) => { efficient: boolean; suspended: boolean; growing?: boolean };
  memoryTotal: number;
}

const single = (g: ProcessGroup): ProcessInfo | undefined =>
  g.children.length === 1 ? g.children[0] : undefined;
const gpuOf = (g: ProcessGroup) =>
  Math.min(
    100,
    g.children.reduce((sum, c) => sum + (c.gpu ?? 0), 0),
  );
const hasGpu = (g: ProcessGroup) => g.children.some((c) => c.gpu !== null);

/** まとめた行の名前（説明があれば説明。本家のように「Google Chrome」などと出す）。 */
export function groupName(g: ProcessGroup, ctx: Pick<ProcessCellContext, 'description'>): string {
  const exe = g.children[0]?.exe ?? '';
  const text = ctx.description(exe);
  return text === '' ? g.name : text;
}

/** まとめた行の状態（全部が中断・効率モードならそれを出す。メモリ増加中は 1 つでもあれば出す）。 */
export function groupStatus(g: ProcessGroup, ctx: Pick<ProcessCellContext, 'marks'>): string {
  const first = g.children[0];
  if (!first) return '';
  if (g.children.length === 1) return processStatusBadge(first.state, ctx.marks(first));
  const marks = g.children.map((c) => ctx.marks(c));
  return processStatusBadge('running', {
    efficient: marks.every((m) => m.efficient),
    suspended: marks.every((m) => m.suspended),
    growing: marks.some((m) => m.growing === true),
  });
}

/** まとめた行の、並べ替えに使う値。 */
export function groupValue(g: ProcessGroup, column: ProcessColumn, ctx: ProcessCellContext): string | number {
  const one = single(g);
  const values: Record<ProcessColumn, () => string | number> = {
    name: () => groupName(g, ctx),
    type: () => kindLabel(ctx.kind(g), ctx.windows),
    status: () => groupStatus(g, ctx),
    publisher: () => ctx.company(g.children[0]?.exe ?? ''),
    pid: () => one?.pid ?? -1,
    processName: () => g.children[0]?.name ?? '',
    command: () => one?.command ?? '',
    cpu: () => g.cpu,
    memory: () => g.memory,
    disk: () => g.diskPerSec,
    gpu: () => gpuOf(g),
  };
  return values[column]();
}

/** まとめた行のセルに出す文字。 */
export function groupText(g: ProcessGroup, column: ProcessColumn, ctx: ProcessCellContext): string {
  const one = single(g);
  const numbers: Partial<Record<ProcessColumn, () => string>> = {
    pid: () => (one ? String(one.pid) : ''),
    cpu: () => formatPercent(g.cpu),
    memory: () => formatBytes(g.memory),
    disk: () => formatRate(g.diskPerSec),
    gpu: () => (hasGpu(g) ? formatPercent(gpuOf(g)) : ''),
  };
  return numbers[column]?.() ?? String(groupValue(g, column, ctx));
}

/** 1 つのプロセスの行のセルに出す文字（まとめた行を開いたときの中身）。 */
export function childText(p: ProcessInfo, column: ProcessColumn, ctx: ProcessCellContext): string {
  const g: ProcessGroup = {
    key: p.name.toLowerCase(),
    name: displayName(p.name),
    pids: [p.pid],
    cpu: p.cpu,
    memory: p.memory,
    diskPerSec: p.diskReadPerSec + p.diskWrittenPerSec,
    children: [p],
  };
  if (column === 'name') return `${displayName(p.name)} (${String(p.pid)})`;
  return groupText(g, column, ctx);
}

/** 使用量の色の濃さ（数値の列だけ）。 */
export function heatOf(
  column: ProcessColumn,
  usage: { cpu: number; memory: number; disk: number; gpu: number },
  memoryTotal: number,
): number {
  if (column === 'cpu') return heatLevel(usage.cpu);
  if (column === 'memory') return heatLevel(shareOf(usage.memory, memoryTotal));
  if (column === 'disk') return rateLevel(usage.disk);
  if (column === 'gpu') return heatLevel(usage.gpu);
  return 0;
}

/** まとめた行の使用量（色を決めるのに使う）。 */
export function groupUsage(g: ProcessGroup): { cpu: number; memory: number; disk: number; gpu: number } {
  return { cpu: g.cpu, memory: g.memory, disk: g.diskPerSec, gpu: gpuOf(g) };
}

/** 1 つのプロセスの使用量。 */
export function processUsage(p: ProcessInfo): { cpu: number; memory: number; disk: number; gpu: number } {
  return { cpu: p.cpu, memory: p.memory, disk: p.diskReadPerSec + p.diskWrittenPerSec, gpu: p.gpu ?? 0 };
}

/** 表に出す区切り。種類分けしないときは、種類の無い 1 つの区切りにする。 */
export interface TableSection {
  kind: ProcessKind | null;
  groups: ProcessGroup[];
}

export function tableSections(
  groups: ProcessGroup[],
  grouped: boolean,
  kindOf: (group: ProcessGroup) => ProcessKind,
): TableSection[] {
  return grouped ? sectionsOf(groups, kindOf) : [{ kind: null, groups }];
}

/**
 * 先頭から `limit` 個のまとまりだけを残す（少しずつ描くため）。見出しの数は元のまま `count` に残す。
 * まとまりが 1 つも残らない区分は除く。
 */
export function limitSections(
  sections: readonly TableSection[],
  limit: number,
): (TableSection & { count: number })[] {
  let left = Math.max(0, limit);
  const result: (TableSection & { count: number })[] = [];
  for (const section of sections) {
    if (left <= 0) break;
    const groups = left >= section.groups.length ? section.groups : section.groups.slice(0, left);
    left -= groups.length;
    if (groups.length > 0) result.push({ kind: section.kind, groups, count: section.groups.length });
  }
  return result;
}
