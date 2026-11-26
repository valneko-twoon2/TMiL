// グラフ用の履歴（直近 N 回分の値）。
import type { Snapshot } from '../model/types';
import { shareOf } from '../format/heat';

export const HISTORY_CAPACITY = 60;

export type HistoryMap = ReadonlyMap<string, readonly number[]>;

/** 空の履歴（読み取り専用として扱う）。 */
export const EMPTY_HISTORY: HistoryMap = new Map();

/** 末尾に値を足し、容量を超えた分を先頭から捨てる（元の配列は変えない）。 */
export function pushValue(values: readonly number[], value: number, capacity = HISTORY_CAPACITY): number[] {
  if (capacity <= 0) return [];
  const next = [...values, Number.isFinite(value) ? value : 0];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}

/** 履歴のキー。 */
export const historyKey = {
  cpu: 'cpu',
  memory: 'memory',
  diskRead: (name: string) => `disk:${name}:read`,
  diskWrite: (name: string) => `disk:${name}:write`,
  netReceive: (name: string) => `net:${name}:rx`,
  netTransmit: (name: string) => `net:${name}:tx`,
} as const;

/** 計測結果を 1 回分記録した新しい履歴を返す。消えたディスクなどの履歴は捨てる。 */
export function recordSnapshot(
  history: HistoryMap,
  snapshot: Snapshot,
  capacity = HISTORY_CAPACITY,
): Map<string, number[]> {
  const values = new Map<string, number>([
    [historyKey.cpu, snapshot.cpu.usage],
    [historyKey.memory, shareOf(snapshot.memory.used, snapshot.memory.total)],
  ]);
  for (const d of snapshot.disks) {
    values.set(historyKey.diskRead(d.name), d.readPerSec);
    values.set(historyKey.diskWrite(d.name), d.writtenPerSec);
  }
  for (const n of snapshot.networks) {
    values.set(historyKey.netReceive(n.name), n.receivedPerSec);
    values.set(historyKey.netTransmit(n.name), n.transmittedPerSec);
  }
  const next = new Map<string, number[]>();
  for (const [key, value] of values) {
    next.set(key, pushValue(history.get(key) ?? [], value, capacity));
  }
  return next;
}
