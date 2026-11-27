// リソース モニターの「平均 CPU」（プロセスごとの直近 60 秒の平均）と、選んだプロセスの合計の推移（純粋関数）。
import { HISTORY_CAPACITY, pushValue } from '../history/history';
import type { Snapshot } from '../model/types';

/** 平均を取る長さ。 */
export const AVERAGE_WINDOW_MS = 60_000;

export interface CpuSample {
  at: number;
  cpu: number;
}

/** PID → 直近の CPU 使用率。 */
export type CpuSamples = ReadonlyMap<number, readonly CpuSample[]>;

/** 計測結果を 1 回分足す。古いものと、消えたプロセスの分は捨てる。 */
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

/** 平均 CPU。記録が無ければ null。 */
export function averageCpu(samples: CpuSamples, pid: number): number | null {
  const list = samples.get(pid);
  if (!list || list.length === 0) return null;
  return list.reduce((sum, s) => sum + s.cpu, 0) / list.length;
}

/** 選んだプロセスの CPU 使用率の合計を、推移に足す（グラフの「選んだプロセス」の線）。 */
export function pushSelectedTotal(
  history: readonly number[],
  snapshot: Snapshot,
  selected: ReadonlySet<number>,
  capacity = HISTORY_CAPACITY,
): number[] {
  const total = snapshot.processes.filter((p) => selected.has(p.pid)).reduce((sum, p) => sum + p.cpu, 0);
  return pushValue(history, Math.min(100, total), capacity);
}

/** まだ記録が無い状態。 */
export const NO_SAMPLES: CpuSamples = new Map();

/** もう一覧に無いプロセス（チェックから外すもの）。 */
export function goneProcesses(pids: Iterable<number>, snapshot: Snapshot): number[] {
  const alive = new Set(snapshot.processes.map((p) => p.pid));
  return [...pids].filter((pid) => !alive.has(pid));
}
