import type { Api } from '../api/ipc';
import type { Toasts } from './toast.svelte';

/** 契約: 要約ビューは、ウィンドウごと一覧だけの小さな窓になる状態。 */
export class SummaryView {
  on = $state(false);
  readonly #api: Pick<Api, 'setSummaryView'>;
  readonly #toasts: Pick<Toasts, 'show'>;

  constructor(api: Pick<Api, 'setSummaryView'>, toasts: Pick<Toasts, 'show'>) {
    this.#api = api;
    this.#toasts = toasts;
  }

  /** なぜ: 画面を先に切り替えるので、ウィンドウを変えられなかったときは戻す。 */
  async toggle(): Promise<void> {
    const next = !this.on;
    this.on = next;
    try {
      await this.#api.setSummaryView(next);
    } catch (cause) {
      this.on = !next;
      this.#toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }
}
