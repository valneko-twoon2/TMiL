import { formatBytes, formatCount, formatCpuTime, formatPercent, formatRate } from '../format/format';
import { heatLevel, rateLevel, shareOf } from '../format/heat';
import { processStateLabel } from '../format/labels';
import type { ProcessInfo } from '../model/types';
import type { TableColumn } from '../table/table';
import { displayName } from './process';

export interface ProcessTableContext {
  icon?: (exe: string) => string | null | undefined;
  description?: (exe: string) => string;
  memoryTotal?: number;
  averageCpu?: (pid: number) => number | null;
  connections?: (pid: number) => number;
}

type Column = TableColumn<ProcessInfo>;
type Build = (ctx: ProcessTableContext) => Omit<Column, 'key'>;

const disk = (p: ProcessInfo) => p.diskReadPerSec + p.diskWrittenPerSec;
const orMinus = (v: number | null) => v ?? -1;

function numeric(
  label: string,
  width: number,
  value: (p: ProcessInfo) => number,
  text: (p: ProcessInfo) => string,
): Omit<Column, 'key'> {
  return { label, numeric: true, width, value, text };
}

function describe(ctx: ProcessTableContext, p: ProcessInfo): string {
  const text = ctx.description?.(p.exe) ?? '';
  return text === '' ? displayName(p.name) : text;
}

function averageText(ctx: ProcessTableContext, p: ProcessInfo): string {
  const avg = ctx.averageCpu?.(p.pid) ?? null;
  return avg === null ? '' : formatPercent(avg, 2);
}

const COLUMNS = {
  image: (ctx) => ({
    label: 'イメージ',
    width: 180,
    value: (p) => p.name,
    icon: ctx.icon ? (p) => ctx.icon?.(p.exe) : undefined,
  }),
  pid: () => ({ label: 'PID', numeric: true, width: 70, value: (p) => p.pid }),
  description: (ctx) => ({ label: '説明', width: 200, value: (p) => describe(ctx, p) }),
  state: () => ({ label: '状態', width: 80, value: (p) => processStateLabel(p.state) }),
  user: () => ({ label: 'ユーザー名', width: 110, value: (p) => p.user }),
  threads: () =>
    numeric(
      'スレッド',
      80,
      (p) => orMinus(p.threads),
      (p) => formatCount(p.threads),
    ),
  handles: () =>
    numeric(
      'ハンドル',
      80,
      (p) => orMinus(p.handles),
      (p) => formatCount(p.handles),
    ),
  cpu: () => ({
    ...numeric(
      'CPU',
      70,
      (p) => p.cpu,
      (p) => formatPercent(p.cpu),
    ),
    heat: (p) => heatLevel(p.cpu),
  }),
  averageCpu: (ctx) =>
    numeric(
      '平均 CPU',
      80,
      (p) => ctx.averageCpu?.(p.pid) ?? -1,
      (p) => averageText(ctx, p),
    ),
  cpuTime: () =>
    numeric(
      'CPU 時間',
      90,
      (p) => p.cpuTimeMs,
      (p) => formatCpuTime(p.cpuTimeMs),
    ),
  memory: (ctx) => ({
    ...numeric(
      'ワーキング セット',
      120,
      (p) => p.memory,
      (p) => formatBytes(p.memory),
    ),
    heat: (p) => heatLevel(shareOf(p.memory, ctx.memoryTotal ?? 0)),
  }),
  commit: () =>
    numeric(
      'コミット',
      110,
      (p) => p.virtualMemory,
      (p) => formatBytes(p.virtualMemory),
    ),
  diskRead: () =>
    numeric(
      '読み取り',
      100,
      (p) => p.diskReadPerSec,
      (p) => formatRate(p.diskReadPerSec),
    ),
  diskWrite: () =>
    numeric(
      '書き込み',
      100,
      (p) => p.diskWrittenPerSec,
      (p) => formatRate(p.diskWrittenPerSec),
    ),
  diskTotal: () => ({
    ...numeric('合計', 100, disk, (p) => formatRate(disk(p))),
    heat: (p) => rateLevel(disk(p)),
  }),
  readTotal: () =>
    numeric(
      '読み取り（累計）',
      120,
      (p) => p.diskReadTotal,
      (p) => formatBytes(p.diskReadTotal),
    ),
  writeTotal: () =>
    numeric(
      '書き込み（累計）',
      120,
      (p) => p.diskWrittenTotal,
      (p) => formatBytes(p.diskWrittenTotal),
    ),
  gpu: () => ({
    ...numeric(
      'GPU',
      70,
      (p) => orMinus(p.gpu),
      (p) => (p.gpu === null ? '' : formatPercent(p.gpu)),
    ),
    heat: (p) => heatLevel(p.gpu ?? 0),
  }),
  connections: (ctx) => ({
    label: '接続',
    numeric: true,
    width: 70,
    value: (p) => ctx.connections?.(p.pid) ?? 0,
  }),
  exe: () => ({ label: 'イメージ パス名', width: 280, value: (p) => p.exe, muted: true }),
} satisfies Record<string, Build>;

export type ProcessTableKey = keyof typeof COLUMNS;

export type ProcessColumnSpec = ProcessTableKey | { key: ProcessTableKey; label: string };

export function processTableColumns(
  specs: readonly ProcessColumnSpec[],
  ctx: ProcessTableContext = {},
): Column[] {
  return specs.map((spec) => {
    const key = typeof spec === 'string' ? spec : spec.key;
    const built: Column = { key, ...COLUMNS[key](ctx) };
    return typeof spec === 'string' ? built : { ...built, label: spec.label };
  });
}
