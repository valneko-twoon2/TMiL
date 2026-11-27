// リソース モニターの状態: 選んだプロセス（チェック）、平均 CPU、接続の一覧、ハンドルの検索、モジュール。
import { SvelteSet } from 'svelte/reactivity';
import type { Api } from '../api/ipc';
import type { Connection, HandleInfo, ModuleInfo, ProcessInfo, Snapshot } from '../model/types';
import {
  averageCpu,
  goneProcesses,
  NO_SAMPLES,
  pushSelectedTotal,
  recordCpu,
  type CpuSamples,
} from '../resmon/average';

export interface ProcessModules {
  pid: number;
  name: string;
  modules: ModuleInfo[];
  error: string | null;
}

export class ResourceMonitorState {
  /** チェックしたプロセス（ほかの表をこれで絞り込む） */
  readonly checked = new SvelteSet<number>();
  connections = $state.raw<Connection[]>([]);
  connectionsError = $state<string | null>(null);
  modules = $state.raw<ProcessModules[]>([]);
  /** ハンドルの検索結果と、検索した文字 */
  handles = $state.raw<HandleInfo[]>([]);
  handlesError = $state<string | null>(null);
  handlesQuery = $state('');
  searchingHandles = $state(false);
  #handleSearch = 0;
  /** 選んだプロセスの CPU 使用率の合計の推移 */
  selectedHistory = $state.raw<number[]>([]);
  #samples = $state.raw<CpuSamples>(NO_SAMPLES);
  readonly #api: Pick<Api, 'networkConnections' | 'processModules' | 'findHandles'>;
  #loadingConnections: Promise<void> | null = null;

  constructor(api: Pick<Api, 'networkConnections' | 'processModules' | 'findHandles'>) {
    this.#api = api;
  }

  record(snapshot: Snapshot): void {
    this.#samples = recordCpu(this.#samples, snapshot);
    // 終了したプロセスはチェックから外す
    for (const pid of goneProcesses(this.checked, snapshot)) this.checked.delete(pid);
    this.selectedHistory =
      this.checked.size === 0 ? [] : pushSelectedTotal(this.selectedHistory, snapshot, this.checked);
  }

  average(pid: number): number | null {
    return averageCpu(this.#samples, pid);
  }

  toggle(pid: number, on: boolean): void {
    if (on) this.checked.add(pid);
    else this.checked.delete(pid);
    this.selectedHistory = [];
  }

  /** 接続の一覧を読み直す（読み込み中なら待つだけ）。 */
  refreshConnections(): Promise<void> {
    this.#loadingConnections ??= this.#fetchConnections().finally(() => {
      this.#loadingConnections = null;
    });
    return this.#loadingConnections;
  }

  async #fetchConnections(): Promise<void> {
    try {
      this.connections = await this.#api.networkConnections();
      this.connectionsError = null;
    } catch (cause) {
      this.connectionsError = cause instanceof Error ? cause.message : String(cause);
    }
  }

  /** ファイルやフォルダーを開いているプロセスを探す（後から始めた検索の結果だけを残す）。 */
  async searchHandles(query: string): Promise<void> {
    const q = query.trim();
    const id = ++this.#handleSearch;
    this.handlesQuery = q;
    if (q === '') {
      this.handles = [];
      this.handlesError = null;
      this.searchingHandles = false;
      return;
    }
    this.searchingHandles = true;
    try {
      const found = await this.#api.findHandles(q);
      if (id !== this.#handleSearch) return;
      this.handles = found;
      this.handlesError = null;
    } catch (cause) {
      if (id !== this.#handleSearch) return;
      this.handles = [];
      this.handlesError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (id === this.#handleSearch) this.searchingHandles = false;
    }
  }

  /** チェックしたプロセスのモジュールを読む。 */
  async loadModules(processes: readonly ProcessInfo[]): Promise<void> {
    const loaded = await Promise.all(
      processes.map(async (p): Promise<ProcessModules> => {
        try {
          return { pid: p.pid, name: p.name, modules: await this.#api.processModules(p.pid), error: null };
        } catch (cause) {
          return {
            pid: p.pid,
            name: p.name,
            modules: [],
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }
      }),
    );
    this.modules = loaded;
  }
}
