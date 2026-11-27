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

export interface ProcessMarks {
  efficient: boolean;
  suspended: boolean;
  memoryGrowing: boolean;
}

export interface ProcessActionOptions {
  confirmEfficiency?: () => boolean;
  usage?: ProcessUsage;
}

export interface MenuExtras {
  before?: MenuItem[];
  middle?: MenuItem[];
  after?: MenuItem[];
  onextra?: (id: string) => void;
  onend?: () => void;
}

const PRIORITY_PREFIX = 'priority:';

export function priorityEntries(current: Priority | null | undefined): MenuEntry[] {
  return PRIORITIES.map((p) => ({
    id: `${PRIORITY_PREFIX}${p}`,
    label: priorityLabel(p),
    checked: current === p,
  }));
}

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

export function priorityOf(id: string): Priority | null {
  if (!id.startsWith(PRIORITY_PREFIX)) return null;
  const value = id.slice(PRIORITY_PREFIX.length);
  return PRIORITIES.find((p) => p === value) ?? null;
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export class ProcessActions {
  dialog = $state<ProcessDialog>(null);
  busy = $state(false);
  readonly efficient = new SvelteSet<string>();
  readonly suspended = new SvelteSet<string>();
  readonly #api: Api;
  readonly #monitor: Monitor;
  readonly #toasts: Toasts;
  readonly #menus: ContextMenus;
  readonly #confirmEfficiency: () => boolean;
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
      efficient: this.efficient.has(key) || p.efficient,
      suspended: this.suspended.has(key),
      memoryGrowing: this.usage.growth(p) !== null,
    };
  }

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

  showUsage(p: ProcessInfo): void {
    this.dialog = { kind: 'usage', process: p };
  }

  #mark(set: SvelteSet<string>, processes: ProcessInfo[], results: KillResult[], on: boolean): void {
    for (const r of results) {
      const p = processes.find((x) => x.pid === r.pid);
      if (!r.ok || !p) continue;
      if (on) set.add(processKey(p));
      else set.delete(processKey(p));
    }
  }

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

  suspend(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.suspendProcesses(processes.map(toKillTarget));
      this.#mark(this.suspended, processes, results, true);
      this.#report(results, '中断できませんでした。');
    });
  }

  resume(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.resumeProcesses(processes.map(toKillTarget));
      this.#mark(this.suspended, processes, results, false);
      this.#report(results, '再開できませんでした。');
    });
  }

  async switchTo(pid: number): Promise<void> {
    try {
      await this.#api.switchToWindow(pid);
    } catch (cause) {
      this.#toasts.show(message(cause), 'error');
    }
  }

  restart(p: ProcessInfo): Promise<void> {
    return this.#run(async () => {
      const results = await this.#api.killProcesses([toKillTarget(p)]);
      this.#report(results, '終了できませんでした。');
      if (results.every((r) => r.ok)) await this.#api.runTask(p.exe === '' ? p.name : `"${p.exe}"`, false);
      await this.#monitor.refresh();
    });
  }

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

  end(processes: ProcessInfo[]): Promise<void> {
    return this.#run(async () => {
      this.#report(await this.#api.killProcesses(processes.map(toKillTarget)), '終了できませんでした。');
      await this.#monitor.refresh();
    });
  }

  confirmTree(p: ProcessInfo): void {
    const members = processTree(p.pid, this.#monitor.snapshot?.processes ?? [p]);
    this.dialog = { kind: 'tree', root: p, members: members.length > 0 ? members : [p] };
  }

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

  async openAffinity(p: ProcessInfo): Promise<void> {
    const cores = this.#monitor.systemInfo?.logicalCores ?? 1;
    this.dialog = { kind: 'affinity', process: p, cpus: null, cores };
    const opened = this.dialog;
    let cpus: number[];
    try {
      cpus = (await this.#api.processControls(p.pid)).affinity ?? [];
    } catch {
      cpus = [];
    }
    if (this.dialog !== opened) return;
    const all = Array.from({ length: cores }, (_, i) => i);
    this.dialog = { ...opened, cpus: cpus.length > 0 ? cpus.filter((c) => c < cores) : all };
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
