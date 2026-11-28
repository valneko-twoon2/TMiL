// OS はアプリごとの記録を持っていない（Windows の記録は読めない）ので、計測結果の累計値の増え方を足し合わせる。
import { formatBytes, formatCpuTime } from '../format/format';
import type { ProcessInfo, Snapshot } from '../model/types';
import type { TableColumn } from '../table/table';
import { displayName } from '../process/process';

export interface AppUsage {
  key: string;
  name: string;
  exe: string;
  cpuMs: number;
  readBytes: number;
  writtenBytes: number;
}

export interface AppHistoryData {
  /** 記録を始めた時刻（UNIX ミリ秒） */
  since: number;
  /** 終わったプロセスの分を足し合わせたもの */
  apps: Record<string, AppUsage>;
}

interface LiveProcess {
  key: string;
  name: string;
  exe: string;
  base: [number, number, number];
  now: [number, number, number];
}

export interface UsageTracker {
  data: AppHistoryData;
  live: ReadonlyMap<string, LiveProcess>;
  last: number | null;
}

export const APP_HISTORY_STORAGE_KEY = 'taskmanagerlite.appHistory';
const MAX_APPS = 2000;

export function appKey(name: string): string {
  return name.toLowerCase();
}

const valuesOf = (p: ProcessInfo): [number, number, number] => [
  p.cpuTimeMs,
  p.diskReadTotal,
  p.diskWrittenTotal,
];

export function newTracker(data: AppHistoryData): UsageTracker {
  return { data, live: new Map(), last: null };
}

function addUsage(apps: Record<string, AppUsage>, p: LiveProcess): void {
  const delta = p.now.map((v, i) => Math.max(0, v - (p.base[i] ?? 0)));
  const prev = apps[p.key] ?? {
    key: p.key,
    name: p.name,
    exe: p.exe,
    cpuMs: 0,
    readBytes: 0,
    writtenBytes: 0,
  };
  apps[p.key] = {
    ...prev,
    exe: prev.exe === '' ? p.exe : prev.exe,
    cpuMs: prev.cpuMs + (delta[0] ?? 0),
    readBytes: prev.readBytes + (delta[1] ?? 0),
    writtenBytes: prev.writtenBytes + (delta[2] ?? 0),
  };
}

export function track(tracker: UsageTracker, snapshot: Snapshot): UsageTracker {
  const live = new Map<string, LiveProcess>();
  for (const p of snapshot.processes) {
    const id = `${String(p.pid)}:${String(p.startTime)}`;
    const known = tracker.live.get(id);
    const now = valuesOf(p);
    const bornAfterLast = tracker.last !== null && p.startTime * 1000 > tracker.last;
    const base = known?.base ?? (bornAfterLast ? [0, 0, 0] : now);
    live.set(id, { key: appKey(p.name), name: displayName(p.name), exe: p.exe, base, now });
  }
  const apps = { ...tracker.data.apps };
  for (const [id, p] of tracker.live) if (!live.has(id)) addUsage(apps, p);
  return { data: { ...tracker.data, apps }, live, last: snapshot.timestampMs };
}

export function totals(tracker: UsageTracker): AppUsage[] {
  const apps = { ...tracker.data.apps };
  for (const p of tracker.live.values()) addUsage(apps, p);
  return Object.values(apps);
}

export function cleared(tracker: UsageTracker, now: number): UsageTracker {
  const live = new Map([...tracker.live].map(([id, p]) => [id, { ...p, base: p.now }]));
  return { data: { since: now, apps: {} }, live, last: tracker.last };
}

export function serializeHistory(tracker: UsageTracker): string {
  const apps = Object.fromEntries(totals(tracker).map((a) => [a.key, a]));
  return JSON.stringify({ since: tracker.data.since, apps });
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseUsage(key: string, value: unknown): AppUsage | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isCount(v.cpuMs) || !isCount(v.readBytes) || !isCount(v.writtenBytes)) return null;
  return {
    key,
    name: typeof v.name === 'string' ? v.name : key,
    exe: typeof v.exe === 'string' ? v.exe : '',
    cpuMs: v.cpuMs,
    readBytes: v.readBytes,
    writtenBytes: v.writtenBytes,
  };
}

export function parseHistory(raw: string | null, now: number): AppHistoryData {
  const empty = { since: now, apps: {} };
  if (raw === null) return empty;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof data !== 'object' || data === null) return empty;
  const rec = data as Record<string, unknown>;
  if (!isCount(rec.since) || typeof rec.apps !== 'object' || rec.apps === null) return empty;
  const apps = Object.entries(rec.apps as Record<string, unknown>)
    .slice(0, MAX_APPS)
    .flatMap(([key, value]) => {
      const usage = parseUsage(key, value);
      return usage ? [[key, usage] as const] : [];
    });
  return { since: rec.since, apps: Object.fromEntries(apps) };
}

export function appHistoryColumns(
  icon: (exe: string) => string | null | undefined,
  description: (exe: string) => string,
): TableColumn<AppUsage>[] {
  return [
    {
      key: 'name',
      label: '名前',
      width: 280,
      value: (a) => (description(a.exe) === '' ? a.name : description(a.exe)),
      icon: (a) => icon(a.exe),
    },
    {
      key: 'cpu',
      label: 'CPU 時間',
      numeric: true,
      width: 110,
      value: (a) => a.cpuMs,
      text: (a) => formatCpuTime(a.cpuMs),
    },
    {
      key: 'read',
      label: '読み取り',
      numeric: true,
      width: 120,
      value: (a) => a.readBytes,
      text: (a) => formatBytes(a.readBytes),
    },
    {
      key: 'written',
      label: '書き込み',
      numeric: true,
      width: 120,
      value: (a) => a.writtenBytes,
      text: (a) => formatBytes(a.writtenBytes),
    },
  ];
}

export function filterUsage(rows: readonly AppUsage[], query: string): AppUsage[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...rows];
  return rows.filter((a) => a.name.toLowerCase().includes(q) || a.key.includes(q));
}
