import type { ProcessInfo, Snapshot } from '../model/types';
import {
  growingProcesses,
  NO_GROWTH,
  NO_USAGE,
  processKey,
  recentAverage,
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

  series(p: Pick<ProcessInfo, 'pid' | 'startTime'>): UsageSeries {
    return this.#samples.get(processKey(p)) ?? { cpu: [], memory: [] };
  }

  averageCpu(p: Pick<ProcessInfo, 'pid' | 'startTime'>): number | null {
    return recentAverage(this.series(p).cpu);
  }

  growth(p: Pick<ProcessInfo, 'pid' | 'startTime'>): number | null {
    return this.#growing.get(processKey(p)) ?? null;
  }

  get growingCount(): number {
    return this.#growing.size;
  }
}
