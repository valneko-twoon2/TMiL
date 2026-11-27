// プロセスごとの使用状況の推移。計測が届くたびに進め、メモリが増え続けているプロセスを覚えておく。
import type { ProcessInfo, Snapshot } from '../model/types';
import {
  growingProcesses,
  NO_GROWTH,
  NO_USAGE,
  processKey,
  recordUsage,
  USAGE_CAPACITY,
  type UsageSamples,
  type UsageSeries,
} from '../process/usage';

export class ProcessUsage {
  #samples = $state.raw<UsageSamples>(NO_USAGE);
  #growing = $state.raw<ReadonlyMap<string, number>>(NO_GROWTH);
  readonly #capacity: number;

  constructor(capacity = USAGE_CAPACITY) {
    this.#capacity = capacity;
  }

  record(snapshot: Pick<Snapshot, 'processes'>): void {
    this.#samples = recordUsage(this.#samples, snapshot, this.#capacity);
    this.#growing = growingProcesses(this.#samples);
  }

  /** そのプロセスの推移（まだ無ければ空）。 */
  series(p: Pick<ProcessInfo, 'pid' | 'startTime'>): UsageSeries {
    return this.#samples.get(processKey(p)) ?? { cpu: [], memory: [] };
  }

  /** メモリが増え続けていれば増えた量。 */
  growth(p: Pick<ProcessInfo, 'pid' | 'startTime'>): number | null {
    return this.#growing.get(processKey(p)) ?? null;
  }

  /** メモリが増え続けているプロセスの数。 */
  get growingCount(): number {
    return this.#growing.size;
  }
}
