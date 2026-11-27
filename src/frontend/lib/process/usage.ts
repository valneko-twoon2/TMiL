// プロセスごとの CPU とメモリの推移（使用状況のグラフ）と、メモリが増え続けているかの判定（純粋関数）。
import type { ProcessInfo, Snapshot } from '../model/types';

/** 覚えておく計測の数（1 秒ごとなら 5 分） */
export const USAGE_CAPACITY = 300;
/** 増え続けていると判断するのに要る計測の数 */
export const LEAK_MIN_SAMPLES = 60;
/** 増え続けていると判断する、増えた量の下限 */
export const LEAK_MIN_BYTES = 50 * 1024 ** 2;
/** 増え続けていると判断する、増えた割合の下限（はじめの量に対して） */
export const LEAK_MIN_RATIO = 0.2;

export interface UsageSeries {
  cpu: readonly number[];
  memory: readonly number[];
}

export type UsageSamples = ReadonlyMap<string, UsageSeries>;

export const NO_USAGE: UsageSamples = new Map<string, UsageSeries>();

/** プロセスを見分ける鍵（PID は使い回されるので起動時刻も使う）。 */
export function processKey(p: Pick<ProcessInfo, 'pid' | 'startTime'>): string {
  return `${String(p.pid)}:${String(p.startTime)}`;
}

function pushCapped(values: readonly number[], value: number, capacity: number): number[] {
  const start = Math.max(0, values.length - capacity + 1);
  return [...values.slice(start), value];
}

/** 計測結果を 1 つ足す（終了したプロセスは消し、古いものは capacity で切る）。 */
export function recordUsage(
  samples: UsageSamples,
  snapshot: Pick<Snapshot, 'processes'>,
  capacity = USAGE_CAPACITY,
): Map<string, UsageSeries> {
  const next = new Map<string, UsageSeries>();
  if (capacity <= 0) return next;
  for (const p of snapshot.processes) {
    const key = processKey(p);
    const prev = samples.get(key);
    next.set(key, {
      cpu: pushCapped(prev?.cpu ?? [], p.cpu, capacity),
      memory: pushCapped(prev?.memory ?? [], p.memory, capacity),
    });
  }
  return next;
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * メモリが増え続けていれば、増えた量（バイト）。そうでなければ null。
 * 推移を 4 つに分け、平均が毎回増えていて、はじめより十分に（量でも割合でも）増えているときに増え続けているとみなす。
 * 一度だけ跳ね上がってそのままのものは、平均が途中で増えないので含めない。
 */
export function memoryGrowth(memory: readonly number[]): number | null {
  if (memory.length < LEAK_MIN_SAMPLES) return null;
  const quarter = Math.floor(memory.length / 4);
  const parts = [
    memory.slice(0, quarter),
    memory.slice(quarter, quarter * 2),
    memory.slice(quarter * 2, quarter * 3),
    memory.slice(memory.length - quarter),
  ].map(mean);
  for (let i = 1; i < parts.length; i += 1) {
    if ((parts[i] ?? 0) <= (parts[i - 1] ?? 0)) return null;
  }
  const first = parts[0] ?? 0;
  const growth = (parts[3] ?? 0) - first;
  return growth >= Math.max(LEAK_MIN_BYTES, first * LEAK_MIN_RATIO) ? growth : null;
}

/** メモリが増え続けているプロセス（鍵と増えた量）。 */
export function growingProcesses(samples: UsageSamples): Map<string, number> {
  const growing = new Map<string, number>();
  for (const [key, series] of samples) {
    const growth = memoryGrowth(series.memory);
    if (growth !== null) growing.set(key, growth);
  }
  return growing;
}

/** 推移が何秒分か（計測の数と間隔から）。 */
export function spanSeconds(samples: number, intervalMs: number): number {
  return (Math.max(0, samples - 1) * Math.max(0, intervalMs)) / 1000;
}

/** 推移の長さの表示（1 分未満は秒、それ以上は分）。 */
export function spanLabel(seconds: number): string {
  const secs = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return secs < 60 ? `${String(secs)} 秒` : `${String(Math.round(secs / 60))} 分`;
}

export const NO_GROWTH: ReadonlyMap<string, number> = new Map<string, number>();
