// ウィンドウを出しているプロセス（本家の「アプリ」）の一覧。プロセス タブの種類分けと「切り替え」に使う。
// 一覧を取るのに時間がかかる（Windows で 0.3 秒ほど）ので、計測とは別に間をあけて読み直す。
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Api } from '../api/ipc';

export class AppWindows {
  /** PID → ウィンドウのタイトル */
  readonly titles = new SvelteMap<number, string>();
  readonly pids = new SvelteSet<number>();
  readonly #api: Pick<Api, 'appWindows'>;
  #loading: Promise<void> | null = null;

  constructor(api: Pick<Api, 'appWindows'>) {
    this.#api = api;
  }

  /** 読み直す。読み込み中なら、その結果を待つだけにする。失敗したら前の一覧のままにする。 */
  refresh(): Promise<void> {
    this.#loading ??= this.#fetch().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  async #fetch(): Promise<void> {
    try {
      const windows = await this.#api.appWindows();
      this.titles.clear();
      for (const w of windows) this.titles.set(w.pid, w.title);
      this.pids.clear();
      for (const w of windows) this.pids.add(w.pid);
    } catch {
      // 一覧が取れなくても、種類分けが「バックグラウンド」に寄るだけなので知らせない
    }
  }
}
