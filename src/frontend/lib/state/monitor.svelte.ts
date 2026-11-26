// 計測結果を定期的に取りに行く。ウィンドウが隠れている間は止める。
import type { Api } from '../api/ipc';
import { EMPTY_HISTORY, recordSnapshot, type HistoryMap } from '../history/history';
import type { Snapshot, SystemInfo } from '../model/types';

export class Monitor {
  snapshot = $state.raw<Snapshot | null>(null);
  systemInfo = $state.raw<SystemInfo | null>(null);
  history = $state.raw<HistoryMap>(EMPTY_HISTORY);
  error = $state<string | null>(null);

  readonly #api: Api;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #interval = 0;
  #visible = true;
  #generation = 0;

  constructor(api: Api) {
    this.#api = api;
  }

  /** 1 回だけ取得する。 */
  async refresh(): Promise<void> {
    try {
      const snapshot = await this.#api.snapshot();
      this.snapshot = snapshot;
      this.history = recordSnapshot(this.history, snapshot);
      this.error = null;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async loadSystemInfo(): Promise<void> {
    try {
      this.systemInfo = await this.#api.systemInfo();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  /** 更新間隔を変える。0 で一時停止。 */
  setInterval(ms: number): void {
    this.#interval = ms;
    this.#reschedule();
  }

  /** ウィンドウの表示状態を伝える。 */
  setVisible(visible: boolean): void {
    if (this.#visible === visible) return;
    this.#visible = visible;
    this.#reschedule();
  }

  stop(): void {
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #reschedule(): void {
    this.stop();
    if (this.#interval <= 0 || !this.#visible) return;
    const generation = this.#generation;
    const loop = async (): Promise<void> => {
      await this.refresh();
      if (generation !== this.#generation) return;
      this.#timer = setTimeout(() => void loop(), this.#interval);
    };
    void loop();
  }
}
