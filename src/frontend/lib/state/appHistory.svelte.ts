// アプリの履歴の記録と保存（localStorage）。計測結果が届くたびに App から record を呼ぶ。
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

/** 何回の計測ごとに保存するか（毎回だと書き込みが多いので間引く）。 */
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

  /** 「使用状況の履歴の削除」。今から数え直す。 */
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
