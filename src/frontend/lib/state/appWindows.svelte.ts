// 一覧を取るのに時間がかかる（Windows で 0.3 秒ほど）ので、計測とは別に間をあけて読み直す。
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Api } from '../api/ipc';

export class AppWindows {
  readonly titles = new SvelteMap<number, string>();
  readonly pids = new SvelteSet<number>();
  readonly #api: Pick<Api, 'appWindows'>;
  #loading: Promise<void> | null = null;

  constructor(api: Pick<Api, 'appWindows'>) {
    this.#api = api;
  }

  refresh(): Promise<void> {
    this.#loading ??= this.#fetch().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  async #fetch(): Promise<void> {
    const windows = await this.#api.appWindows().catch(() => null);
    if (windows === null) return;
    this.titles.clear();
    for (const w of windows) this.titles.set(w.pid, w.title);
    this.pids.clear();
    for (const w of windows) this.pids.add(w.pid);
  }
}
