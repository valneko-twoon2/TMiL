// 計測結果を定期的に取りに行く。ウィンドウが隠れている間は止める。
// 取得は同時に 1 つだけにする（重なると転送量や CPU 使用率の計算が乱れるため）。
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
  #running = false;
  #generation = 0;
  #inFlight: Promise<void> | null = null;

  constructor(api: Api) {
    this.#api = api;
  }

  /** 1 回取得する。取得中なら、その結果を待つだけにする。 */
  refresh(): Promise<void> {
    this.#inFlight ??= this.#fetch().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #fetch(): Promise<void> {
    try {
      const snapshot = await this.#api.snapshot();
      // バックエンドが直前の結果を返したときは、同じ点を履歴に足さない
      if (snapshot.timestampMs !== this.snapshot?.timestampMs) {
        this.history = recordSnapshot(this.history, snapshot);
      }
      this.snapshot = snapshot;
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

  /** 更新間隔を変える。0 で一時停止。同じ間隔なら何もしない。 */
  setInterval(ms: number): void {
    if (ms === this.#interval && (this.#running || ms <= 0)) return;
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
    this.#running = false;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #reschedule(): void {
    this.stop();
    if (this.#interval <= 0 || !this.#visible) return;
    this.#running = true;
    const generation = this.#generation;
    const loop = async (): Promise<void> => {
      await this.refresh();
      if (generation !== this.#generation) return;
      this.#timer = setTimeout(() => void loop(), this.#interval);
    };
    void loop();
  }
}
