// プロセスへの操作（右クリックメニューとダイアログ）。プロセス タブと詳細タブで共通に使う。
// 画面は ProcessDialogs が描く。終了してよいか・変えてよいかの判断はバックエンドの状態機械が行う。
import { SvelteSet } from 'svelte/reactivity';
import type { Api } from '../api/ipc';
import { priorityLabel } from '../format/labels';
import { SEPARATOR, type MenuEntry, type MenuItem } from '../menu/menu';
import { PRIORITIES, type KillResult, type Priority, type ProcessInfo } from '../model/types';
import { toKillTarget } from '../process/columns';
import { processTree } from '../process/tree';
import { processKey } from '../process/usage';
import type { ContextMenus } from './menus.svelte';
import { ProcessUsage } from './processUsage.svelte';
import type { Monitor } from './monitor.svelte';
import type { Toasts } from './toast.svelte';

export type ProcessDialog =
  | { kind: 'tree'; root: ProcessInfo; members: ProcessInfo[] }
  | { kind: 'affinity'; process: ProcessInfo; cpus: number[] | null; cores: number }
  | { kind: 'properties'; process: ProcessInfo }
  | { kind: 'efficiency'; processes: ProcessInfo[] }
  | { kind: 'usage'; process: ProcessInfo }
  | null;

export { processKey };

/** この画面で入れた効率モードと中断（OS から読めないので、ここで覚えておく）。 */
export interface ProcessMarks {
  efficient: boolean;
  suspended: boolean;
  /** メモリが増え続けている（使用状況の推移から判断） */
  growing: boolean;
}

export interface ProcessActionOptions {
  /** 効率モードを入れる前に確かめるか（設定で変えられる） */
  confirmEfficiency?: () => boolean;
  /** プロセスごとの使用状況の推移（グラフとメモリ増加中の印に使う） */
  usage?: ProcessUsage;
}

/** ページごとに足す項目（展開する・詳細の表示に移動 など）。 */
export interface MenuExtras {
  /** 先頭に足す項目 */
  before?: MenuItem[];
  /** 「ファイルの場所を開く」の前に足す項目 */
  middle?: MenuItem[];
  /** 最後に足す項目（詳細タブの「サービスに移動」など） */
  after?: MenuItem[];
  /** 足した項目が選ばれたとき */
  onextra?: (id: string) => void;
  /** 「タスクの終了」（ページで選択の解除などをしたいとき） */
  onend?: () => void;
}

const PRIORITY_PREFIX = 'priority:';

/** 優先度の下の階層。今の優先度が分かっていればチェックを付ける。 */
export function priorityEntries(current: Priority | null | undefined): MenuEntry[] {
  return PRIORITIES.map((p) => ({
    id: `${PRIORITY_PREFIX}${p}`,
    label: priorityLabel(p),
    checked: current === p,
  }));
}

/** 右クリックメニューの項目（本家の詳細タブの並びに合わせる）。 */
export function processMenuEntries(
  p: ProcessInfo,
  current: Priority | null | undefined,
  busy: boolean,
  extras: MenuExtras = {},
  efficient = false,
): MenuEntry[] {
  return [
    ...(extras.before ?? []),
    { id: 'end', label: 'タスクの終了', key: 'E', disabled: busy },
    { id: 'tree', label: 'プロセス ツリーの終了', key: 'T', disabled: busy },
    { id: 'efficiency', label: '効率モード', key: 'M', checked: efficient, disabled: busy },
    SEPARATOR,
    { id: 'priority', label: '優先度の設定', key: 'P', children: priorityEntries(current) },
    { id: 'affinity', label: '関係の設定', key: 'F' },
    { id: 'usage', label: '使用状況のグラフ', key: 'G' },
    SEPARATOR,
    ...(extras.middle ?? []),
    { id: 'reveal', label: 'ファイルの場所を開く', key: 'O', disabled: p.exe === '' },
    { id: 'search', label: 'オンライン検索', key: 'N' },
    { id: 'properties', label: 'プロパティ', key: 'R' },
    ...(extras.after ?? []),
  ];
}

/** 選ばれた項目が優先度なら、その値。 */
export function priorityOf(id: string): Priority | null {
  if (!id.startsWith(PRIORITY_PREFIX)) return null;
  const value = id.slice(PRIORITY_PREFIX.length);
  return PRIORITIES.find((p) => p === value) ?? null;
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export class ProcessActions {
  dialog = $state<ProcessDialog>(null);
  busy = $state(false);
  /** 効率モードを入れたプロセス（processKey） */
  readonly efficient = new SvelteSet<string>();
  /** 中断したプロセス（processKey） */
  readonly suspended = new SvelteSet<string>();
  readonly #api: Api;
  readonly #monitor: Monitor;
  readonly #toasts: Toasts;
  readonly #menus: ContextMenus;
  readonly #confirmEfficiency: () => boolean;
  /** プロセスごとの使用状況の推移 */
  readonly usage: ProcessUsage;

  constructor(
    api: Api,
    monitor: Monitor,
    toasts: Toasts,
    menus: ContextMenus,
    options: ProcessActionOptions = {},
  ) {
    this.#api = api;
    this.#monitor = monitor;
    this.#toasts = toasts;
    this.#menus = menus;
    this.#confirmEfficiency = options.confirmEfficiency ?? (() => true);
    this.usage = options.usage ?? new ProcessUsage();
  }

  marks(p: ProcessInfo): ProcessMarks {
    const key = processKey(p);
    return {
      efficient: this.efficient.has(key),
      suspended: this.suspended.has(key),
      growing: this.usage.growth(p) !== null,
    };
  }

  /** 右クリックメニューを開く。今の優先度は後から読み、届いたらチェックを付け直す。 */
  openMenu(event: MouseEvent, p: ProcessInfo, extras: MenuExtras = {}): void {
    const handle = (id: string) => {
      this.#select(id, p, extras);
    };
    const efficient = this.marks(p).efficient;
    this.#menus.open(
      event,
      'プロセスの操作',
      processMenuEntries(p, undefined, this.busy, extras, efficient),
      handle,
    );
    const opened = this.#menus.current;
    void this.#api.processControls(p.pid).then(
      (controls) => {
        if (this.#menus.current !== opened || opened === null) return;
        this.#menus.current = {
          ...opened,
          entries: processMenuEntries(p, controls.priority, this.busy, extras, efficient),
        };
      },
      () => undefined,
    );
  }

  #select(id: string, p: ProcessInfo, extras: MenuExtras): void {
    const priority = priorityOf(id);
    if (priority) {
      void this.setPriority(p, priority);
      return;
    }
    switch (id) {
      case 'end':
        if (extras.onend) extras.onend();
        else void this.end([p]);
        break;
      case 'tree':
        this.confirmTree(p);
        break;
      case 'efficiency':
        this.toggleEfficiency([p]);
        break;
      case 'affinity':
        void this.openAffinity(p);
        break;
      case 'reveal':
        void this.reveal(p.exe);
        break;
      case 'search':
        void this.search(p.name);
        break;
      case 'usage':
        this.showUsage(p);
        break;
      case 'properties':
        this.dialog = { kind: 'properties', process: p };
        break;
      default:
        extras.onextra?.(id);
    }
  }

  /** 使用状況のグラフを開く。 */
  showUsage(p: ProcessInfo): void {
    this.dialog = { kind: 'usage', process: p };
  }

  /** 成功したものだけ、覚えている印を付け直す。 */
  #mark(set: SvelteSet<string>, processes: ProcessInfo[], results: KillResult[], on: boolean): void {
    for (const r of results) {
      const p = processes.find((x) => x.pid === r.pid);
      if (!r.ok || !p) continue;
      if (on) set.add(processKey(p));
      else set.delete(processKey(p));
    }
  }

  /**
   * 「効率モード」を選んだとき。すべて入っていれば外し、そうでなければ入れる。
   * 入れるときは、設定に従って確かめるダイアログを出す（本家と同じく、不安定になることがあるため）。
   */
  toggleEfficiency(processes: ProcessInfo[]): void {
    if (processes.length === 0) return;
    if (processes.every((p) => this.marks(p).efficient)) {
      void this.setEfficiency(processes, false);
    } else if (this.#confirmEfficiency()) {
      this.dialog = { kind: 'efficiency', processes };
    } else {
      void this.setEfficiency(processes, true);
    }
  }

  /** ダイアログで確かめた効率モードを入れる。 */
  async confirmEfficiency(): Promise<void> {
    const dialog = this.dialog;
    if (dialog?.kind !== 'efficiency') return;
    this.dialog = null;
    await this.setEfficiency(dialog.processes, true);
  }

  setEfficiency(processes: ProcessInfo[], on: boolean): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.setProcessEfficiency(processes.map(toKillTarget), on);
      this.#mark(this.efficient, processes, results, on);
      this.#report(results, '効率モードを切り替えられませんでした。');
    });
  }

  /** プロセスを中断する。 */
  suspend(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.suspendProcesses(processes.map(toKillTarget));
      this.#mark(this.suspended, processes, results, true);
      this.#report(results, '中断できませんでした。');
    });
  }

  /** 中断したプロセスを再開する。 */
  resume(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.resumeProcesses(processes.map(toKillTarget));
      this.#mark(this.suspended, processes, results, false);
      this.#report(results, '再開できませんでした。');
    });
  }

  /** そのプロセスのウィンドウに切り替える（本家の「切り替え」）。 */
  async switchTo(pid: number): Promise<void> {
    try {
      await this.#api.switchToWindow(pid);
    } catch (cause) {
      this.#toasts.show(message(cause), 'error');
    }
  }

  /** 終了してから起動し直す（本家のエクスプローラーの「再起動」）。 */
  restart(p: ProcessInfo): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.killProcesses([toKillTarget(p)]);
      this.#report(results, '終了できませんでした。');
      if (results.every((r) => r.ok)) await this.#api.runTask(p.exe === '' ? p.name : `"${p.exe}"`, false);
      await this.#monitor.refresh();
    });
  }

  /** 結果のうち失敗したものを知らせる。 */
  #report(results: KillResult[], fallback: string): void {
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) this.#toasts.show(failed[0]?.error ?? fallback, 'error');
  }

  async #run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await work();
    } catch (cause) {
      this.#toasts.show(message(cause), 'error');
    } finally {
      this.busy = false;
    }
  }

  /** プロセスを終了する。 */
  end(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      this.#report(await this.#api.killProcesses(processes.map(toKillTarget)), '終了できませんでした。');
      await this.#monitor.refresh();
    });
  }

  /** プロセス ツリーの終了を確かめるダイアログを出す。 */
  confirmTree(p: ProcessInfo): void {
    const members = processTree(p.pid, this.#monitor.snapshot?.processes ?? [p]);
    this.dialog = { kind: 'tree', root: p, members: members.length > 0 ? members : [p] };
  }

  /** ダイアログで確かめたツリーを終了する。 */
  async endTree(): Promise<void> {
    const dialog = this.dialog;
    if (dialog?.kind !== 'tree') return;
    this.dialog = null;
    await this.end(dialog.members);
  }

  setPriority(p: ProcessInfo, priority: Priority): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.setProcessPriority([toKillTarget(p)], priority);
      this.#report(results, '優先度を変えられませんでした。');
      if (results.every((r) => r.ok)) {
        this.#toasts.show(`${p.name} の優先度を「${priorityLabel(priority)}」にしました。`);
      }
    });
  }

  /** 関係の設定のダイアログを出し、今の設定を読む。 */
  async openAffinity(p: ProcessInfo): Promise<void> {
    const cores = this.#monitor.systemInfo?.logicalCores ?? 1;
    this.dialog = { kind: 'affinity', process: p, cpus: null, cores };
    let cpus: number[];
    try {
      cpus = (await this.#api.processControls(p.pid)).affinity ?? [];
    } catch {
      cpus = [];
    }
    const all = Array.from({ length: cores }, (_, i) => i);
    // 読んでいる間にダイアログが閉じられたり、別のプロセスのものに変わったりしうる
    const current = this.#currentDialog();
    if (current?.kind === 'affinity' && current.process.pid === p.pid) {
      // 読めなかったときは、すべてのプロセッサを選んだ状態から始める
      this.dialog = { ...current, cpus: cpus.length > 0 ? cpus.filter((c) => c < cores) : all };
    }
  }

  async applyAffinity(cpus: number[]): Promise<void> {
    const dialog = this.dialog;
    if (dialog?.kind !== 'affinity' || cpus.length === 0) return;
    this.dialog = null;
    await this.#run(async () => {
      const results = await this.#api.setProcessAffinity([toKillTarget(dialog.process)], cpus);
      this.#report(results, '関係を変えられませんでした。');
    });
  }

  #currentDialog(): ProcessDialog {
    return this.dialog;
  }

  close(): void {
    this.dialog = null;
  }

  async reveal(path: string): Promise<void> {
    try {
      await this.#api.revealFile(path);
    } catch (cause) {
      this.#toasts.show(message(cause), 'error');
    }
  }

  async search(name: string): Promise<void> {
    try {
      await this.#api.searchOnline(name);
    } catch (cause) {
      this.#toasts.show(message(cause), 'error');
    }
  }
}
