import { formatBytes, formatPercent, formatRate } from '../format/format';
import { heatLevel, rateLevel, shareOf } from '../format/heat';
import { processStatusBadge } from '../format/labels';
import type { ProcessInfo } from '../model/types';
import { displayName, type ProcessGroup } from './process';

export type ProcessKind = 'app' | 'background' | 'system';
export const PROCESS_KINDS: readonly ProcessKind[] = ['app', 'background', 'system'];

export function kindLabel(kind: ProcessKind, windows: boolean): string {
  if (kind === 'app') return 'アプリ';
  if (kind === 'background') return 'バックグラウンド プロセス';
  return windows ? 'Windows プロセス' : 'システム プロセス';
}

const WINDOWS_DIR = /^[a-z]:\\windows\\/i;

export function isSystemProcess(p: ProcessInfo, windows: boolean): boolean {
  if (p.exe === '') return true;
  return windows ? WINDOWS_DIR.test(p.exe) : p.user === 'root';
}

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

export function sectionsOf(
  groups: readonly ProcessGroup[],
  kindOf: (group: ProcessGroup) => ProcessKind,
): KindSection[] {
  return PROCESS_KINDS.map((kind) => ({ kind, groups: groups.filter((g) => kindOf(g) === kind) })).filter(
    (s) => s.groups.length > 0,
  );
}

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
  { key: 'gpuEngine', label: 'GPU エンジン', numeric: false },
  { key: 'power', label: '電力消費', numeric: false },
  { key: 'powerTrend', label: '電源の使用率の傾向', numeric: false },
  { key: 'isolation', label: '分離', numeric: false },
] as const;

export const POWER_LEVELS = ['非常に低い', '低い', '中', '高い', '非常に高い'] as const;
const MB_PER_SEC = 1024 ** 2;

/**
 * CPU・GPU の使用率（%）とディスクの転送量（バイト/秒）から、電力消費の段階（0〜4）を見積もる。
 * 本家の計算は公開されていないので、使用率の合計（ディスクは 10 MB/秒 を 1% とみなす）で区切る。
 */
export function powerLevel(cpu: number, gpu: number, diskPerSec: number): number {
  const score = [cpu, gpu, diskPerSec / (10 * MB_PER_SEC)]
    .filter((v) => Number.isFinite(v) && v > 0)
    .reduce((sum, v) => sum + v, 0);
  if (score < 0.5) return 0;
  if (score < 5) return 1;
  if (score < 15) return 2;
  if (score < 40) return 3;
  return 4;
}

export type ProcessColumn = (typeof PROCESS_COLUMNS)[number]['key'];
export const PROCESS_NUMERIC: readonly ProcessColumn[] = PROCESS_COLUMNS.filter((c) => c.numeric).map(
  (c) => c.key,
);
export const DEFAULT_PROCESS_COLUMNS: readonly ProcessColumn[] = ['name', 'status', 'cpu', 'memory', 'disk'];

export function processColumnLabel(column: ProcessColumn): string {
  return PROCESS_COLUMNS.find((c) => c.key === column)?.label ?? column;
}

export function normalizeProcessColumns(value: unknown): ProcessColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROCESS_COLUMNS];
  const wanted = new Set<unknown>(value);
  wanted.add('name');
  return PROCESS_COLUMNS.map((c) => c.key).filter((key) => wanted.has(key));
}

export function toggleProcessColumn(
  visible: readonly ProcessColumn[],
  column: ProcessColumn,
): ProcessColumn[] {
  if (column === 'name') return normalizeProcessColumns(visible);
  const next = visible.includes(column) ? visible.filter((c) => c !== column) : [...visible, column];
  return normalizeProcessColumns(next);
}

export interface ProcessCellContext {
  kind: (group: ProcessGroup) => ProcessKind;
  windows: boolean;
  description: (exe: string) => string;
  company: (exe: string) => string;
  marks: (p: ProcessInfo) => { efficient: boolean; suspended: boolean; memoryGrowing?: boolean };
  memoryTotal: number;
  averageCpu?: (p: ProcessInfo) => number;
}

const single = (g: ProcessGroup): ProcessInfo | undefined =>
  g.children.length === 1 ? g.children[0] : undefined;
const gpuOf = (g: ProcessGroup) =>
  Math.min(
    100,
    g.children.reduce((sum, c) => sum + (c.gpu ?? 0), 0),
  );
const hasGpu = (g: ProcessGroup) => g.children.some((c) => c.gpu !== null);
const engineOf = (g: ProcessGroup): string =>
  g.children
    .filter((c) => c.gpuEngine !== null)
    .reduce<ProcessInfo | null>(
      (best, c) => (best === null || (c.gpu ?? 0) > (best.gpu ?? 0) ? c : best),
      null,
    )?.gpuEngine ?? '';
const isolationOf = (g: ProcessGroup): string =>
  g.children.length > 0 && g.children.every((c) => c.appContainer) ? 'AppContainer' : '';
const powerOf = (g: ProcessGroup) => powerLevel(g.cpu, gpuOf(g), g.diskPerSec);
const trendOf = (g: ProcessGroup, ctx: Pick<ProcessCellContext, 'averageCpu'>) =>
  powerLevel(
    g.children.reduce((sum, c) => sum + (ctx.averageCpu?.(c) ?? c.cpu), 0),
    0,
    0,
  );

export function groupName(g: ProcessGroup, ctx: Pick<ProcessCellContext, 'description'>): string {
  const exe = g.children[0]?.exe ?? '';
  const text = ctx.description(exe);
  return text === '' ? g.name : text;
}

export function groupStatus(g: ProcessGroup, ctx: Pick<ProcessCellContext, 'marks'>): string {
  const first = g.children[0];
  if (!first) return '';
  if (g.children.length === 1) return processStatusBadge(first.state, ctx.marks(first));
  const marks = g.children.map((c) => ctx.marks(c));
  return processStatusBadge('running', {
    efficient: marks.every((m) => m.efficient),
    suspended: marks.every((m) => m.suspended),
    memoryGrowing: marks.some((m) => m.memoryGrowing === true),
  });
}

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
    gpuEngine: () => engineOf(g),
    power: () => powerOf(g),
    powerTrend: () => trendOf(g, ctx),
    isolation: () => isolationOf(g),
  };
  return values[column]();
}

export function groupText(g: ProcessGroup, column: ProcessColumn, ctx: ProcessCellContext): string {
  const one = single(g);
  const numbers: Partial<Record<ProcessColumn, () => string>> = {
    pid: () => (one ? String(one.pid) : ''),
    cpu: () => formatPercent(g.cpu),
    memory: () => formatBytes(g.memory),
    disk: () => formatRate(g.diskPerSec),
    gpu: () => (hasGpu(g) ? formatPercent(gpuOf(g)) : ''),
    power: () => POWER_LEVELS[powerOf(g)] ?? '',
    powerTrend: () => POWER_LEVELS[trendOf(g, ctx)] ?? '',
  };
  return numbers[column]?.() ?? String(groupValue(g, column, ctx));
}

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

export function groupUsage(g: ProcessGroup): { cpu: number; memory: number; disk: number; gpu: number } {
  return { cpu: g.cpu, memory: g.memory, disk: g.diskPerSec, gpu: gpuOf(g) };
}

export function processUsage(p: ProcessInfo): { cpu: number; memory: number; disk: number; gpu: number } {
  return { cpu: p.cpu, memory: p.memory, disk: p.diskReadPerSec + p.diskWrittenPerSec, gpu: p.gpu ?? 0 };
}

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
