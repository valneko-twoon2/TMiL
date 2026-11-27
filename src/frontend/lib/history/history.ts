import type { DiskStats, Snapshot } from '../model/types';
import { shareOf } from '../format/heat';

export const HISTORY_CAPACITY = 60;

export type HistoryMap = ReadonlyMap<string, readonly number[]>;

export const EMPTY_HISTORY: HistoryMap = new Map();

export function pushValue(values: readonly number[], value: number, capacity = HISTORY_CAPACITY): number[] {
  if (capacity <= 0) return [];
  const next = [...values, Number.isFinite(value) ? value : 0];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}

/**
 * ディスクを区別するキー。名前は空や重複がありうるのでマウントポイントを使い、
 * それも重なるときは 2 つ目以降に番号を付ける。
 */
export function diskKeys(disks: readonly DiskStats[]): string[] {
  const seen = new Map<string, number>();
  return disks.map((d) => {
    const count = seen.get(d.mountPoint) ?? 0;
    seen.set(d.mountPoint, count + 1);
    return count === 0 ? d.mountPoint : `${d.mountPoint}#${String(count)}`;
  });
}

export const historyKey = {
  cpu: 'cpu',
  memory: 'memory',
  diskRead: (key: string) => `disk:${key}:read`,
  diskWrite: (key: string) => `disk:${key}:write`,
  netReceive: (name: string) => `net:${name}:rx`,
  netTransmit: (name: string) => `net:${name}:tx`,
  core: (index: number) => `core:${String(index)}`,
  gpu: (index: number) => `gpu:${String(index)}`,
  gpuMemory: (index: number) => `gpu:${String(index)}:memory`,
} as const;

export function recordSnapshot(
  history: HistoryMap,
  snapshot: Snapshot,
  capacity = HISTORY_CAPACITY,
): Map<string, number[]> {
  const values = new Map<string, number>([
    [historyKey.cpu, snapshot.cpu.usage],
    [historyKey.memory, shareOf(snapshot.memory.used, snapshot.memory.total)],
  ]);
  const keys = diskKeys(snapshot.disks);
  snapshot.disks.forEach((d, i) => {
    const key = keys[i] ?? d.mountPoint;
    values.set(historyKey.diskRead(key), d.readPerSec);
    values.set(historyKey.diskWrite(key), d.writtenPerSec);
  });
  for (const n of snapshot.networks) {
    values.set(historyKey.netReceive(n.name), n.receivedPerSec);
    values.set(historyKey.netTransmit(n.name), n.transmittedPerSec);
  }
  snapshot.cpu.perCore.forEach((usage, i) => values.set(historyKey.core(i), usage));
  snapshot.gpus.forEach((g, i) => {
    values.set(historyKey.gpu(i), g.usage ?? 0);
    values.set(historyKey.gpuMemory(i), shareOf(g.memoryUsed ?? 0, g.memoryTotal ?? 0));
  });
  const next = new Map<string, number[]>();
  for (const [key, value] of values) {
    next.set(key, pushValue(history.get(key) ?? [], value, capacity));
  }
  return next;
}
