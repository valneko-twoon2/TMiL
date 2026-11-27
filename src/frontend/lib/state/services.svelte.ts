// サービスの一覧の読み込みと操作。サービスのページとリソース モニターで使う。
import type { Api } from '../api/ipc';
import type { ServiceAction, ServiceInfo } from '../model/types';
import type { Toasts } from './toast.svelte';

const DONE: Record<ServiceAction, string> = {
  start: 'を開始しました。',
  stop: 'を停止しました。',
  restart: 'を再起動しました。',
};

export class ServiceList {
  list = $state.raw<ServiceInfo[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  busy = $state(false);
  readonly #api: Pick<Api, 'services' | 'controlService' | 'openServicesTool'>;
  readonly #toasts: Toasts;
  #loading: Promise<void> | null = null;

  constructor(api: Pick<Api, 'services' | 'controlService' | 'openServicesTool'>, toasts: Toasts) {
    this.#api = api;
    this.#toasts = toasts;
  }

  /** 読み直す。読み込み中なら、その結果を待つだけにする。 */
  load(): Promise<void> {
    this.#loading ??= this.#fetch().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  async #fetch(): Promise<void> {
    try {
      this.list = await this.#api.services();
      this.error = null;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      this.loaded = true;
    }
  }

  /** サービスを操作し、終わったら一覧を読み直す。 */
  async control(service: ServiceInfo, action: ServiceAction): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.#api.controlService(service.name, action);
      this.#toasts.show(`${service.displayName || service.name} ${DONE[action]}`);
    } catch (cause) {
      this.#toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    } finally {
      this.busy = false;
    }
    await this.load();
  }

  async openTool(): Promise<void> {
    try {
      await this.#api.openServicesTool();
    } catch (cause) {
      this.#toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }
}
