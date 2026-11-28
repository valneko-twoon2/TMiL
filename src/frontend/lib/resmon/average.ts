import { HISTORY_CAPACITY, pushValue } from '../history/history';
import type { Snapshot } from '../model/types';

export const AVERAGE_WINDOW_MS = 60_000;

export interface CpuSample {
  at: number;
  cpu: number;
}

export type CpuSamples = ReadonlyMap<number, readonly CpuSample[]>;

export function recordCpu(
  samples: CpuSamples,
  snapshot: Snapshot,
  windowMs = AVERAGE_WINDOW_MS,
): Map<number, CpuSample[]> {
  const from = snapshot.timestampMs - windowMs;
  const next = new Map<number, CpuSample[]>();
  for (const p of snapshot.processes) {
    const kept = (samples.get(p.pid) ?? []).filter((s) => s.at > from && s.at < snapshot.timestampMs);
    next.set(p.pid, [...kept, { at: snapshot.timestampMs, cpu: p.cpu }]);
  }
  return next;
}

export function averageCpu(samples: CpuSamples, pid: number): number | null {
  const list = samples.get(pid);
  if (!list || list.length === 0) return null;
  return list.reduce((sum, s) => sum + s.cpu, 0) / list.length;
}

export function pushSelectedTotal(
  history: readonly number[],
  snapshot: Snapshot,
  selected: ReadonlySet<number>,
  capacity = HISTORY_CAPACITY,
): number[] {
  const total = snapshot.processes.filter((p) => selected.has(p.pid)).reduce((sum, p) => sum + p.cpu, 0);
  return pushValue(history, Math.min(100, total), capacity);
}

export const NO_SAMPLES: CpuSamples = new Map();

export function goneProcesses(pids: Iterable<number>, snapshot: Snapshot): number[] {
  const alive = new Set(snapshot.processes.map((p) => p.pid));
  return [...pids].filter((pid) => !alive.has(pid));
}
