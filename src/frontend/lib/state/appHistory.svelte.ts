import {
  APP_HISTORY_STORAGE_KEY,
  cleared,
  newTracker,
  parseHistory,
  serializeHistory,
  totals,
  track,
  type AppUsage,
  type UsageTracker,
} from '../history/appHistory';
import type { Snapshot } from '../model/types';

const SAVE_EVERY = 10;

export class AppHistoryStore {
  rows = $state.raw<AppUsage[]>([]);
  since = $state(0);
  #tracker: UsageTracker;
  #storage: Storage | undefined;
  #unsaved = 0;

  constructor(storage: Storage | undefined, now = Date.now()) {
    this.#storage = storage;
    this.#tracker = newTracker(parseHistory(storage?.getItem(APP_HISTORY_STORAGE_KEY) ?? null, now));
    this.#publish();
  }

  record(snapshot: Snapshot): void {
    this.#tracker = track(this.#tracker, snapshot);
    this.#publish();
    this.#unsaved += 1;
    if (this.#unsaved >= SAVE_EVERY) this.save();
  }

  clear(now = Date.now()): void {
    this.#tracker = cleared(this.#tracker, now);
    this.#publish();
    this.save();
  }

  save(): void {
    this.#unsaved = 0;
    this.#storage?.setItem(APP_HISTORY_STORAGE_KEY, serializeHistory(this.#tracker));
  }

  #publish(): void {
    this.rows = totals(this.#tracker);
    this.since = this.#tracker.data.since;
  }
}
