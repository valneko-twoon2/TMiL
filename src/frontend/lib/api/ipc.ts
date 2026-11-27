// バックエンドのコマンド呼び出し。受け取った値は契約どおりかを確かめてから返す。
import { invoke } from '@tauri-apps/api/core';
import {
  isAppWindows,
  isConnections,
  isHandles,
  isModules,
  isServices,
  isKillResults,
  isNull,
  isProcessControls,
  isProcessIcons,
  isReplacementStatus,
  decodeProcessRow,
  isProcessDetailsList,
  isSnapshotWire,
  isStartupEntries,
  isSystemInfo,
} from '../model/guards';
import type {
  AppWindow,
  Connection,
  HandleInfo,
  ModuleInfo,
  ServiceAction,
  ServiceInfo,
  KillResult,
  KillTarget,
  Priority,
  ProcessControls,
  ProcessDetails,
  ProcessIcon,
  ProcessRowValues,
  ReplacementStatus,
  Snapshot,
  StartupEntry,
  SystemInfo,
} from '../model/types';

import { DETAILS_RETRY_MS, detailsToFetch, joinSnapshot, rememberDetails } from '../model/wire';

export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** 契約と違う値が返ってきたときのエラー。 */
export class ContractError extends Error {
  constructor(readonly command: string) {
    super(`${command} の応答が想定と違います`);
    this.name = 'ContractError';
  }
}

/** バックエンドが返したエラー文（文字列）を Error にする。 */
export function toError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (typeof cause === 'string') return new Error(cause);
  return new Error('不明なエラーが発生しました');
}

export interface Api {
  snapshot(): Promise<Snapshot>;
  systemInfo(): Promise<SystemInfo>;
  killProcesses(targets: KillTarget[]): Promise<KillResult[]>;
  startupEntries(): Promise<StartupEntry[]>;
  setStartupEnabled(id: string, enabled: boolean): Promise<void>;
  taskmgrReplacement(): Promise<ReplacementStatus>;
  setTaskmgrReplacement(enabled: boolean): Promise<ReplacementStatus>;
  processIcons(exes: string[]): Promise<ProcessIcon[]>;
  revealFile(path: string): Promise<void>;
  setProcessPriority(targets: KillTarget[], priority: Priority): Promise<KillResult[]>;
  setProcessAffinity(targets: KillTarget[], cpus: number[]): Promise<KillResult[]>;
  processControls(pid: number): Promise<ProcessControls>;
  searchOnline(query: string): Promise<void>;
  suspendProcesses(targets: KillTarget[]): Promise<KillResult[]>;
  resumeProcesses(targets: KillTarget[]): Promise<KillResult[]>;
  setProcessEfficiency(targets: KillTarget[], enabled: boolean): Promise<KillResult[]>;
  runTask(command: string, admin: boolean): Promise<void>;
  appWindows(): Promise<AppWindow[]>;
  switchToWindow(pid: number): Promise<void>;
  services(): Promise<ServiceInfo[]>;
  controlService(name: string, action: ServiceAction): Promise<void>;
  openServicesTool(): Promise<void>;
  networkConnections(): Promise<Connection[]>;
  processModules(pid: number): Promise<ModuleInfo[]>;
  findHandles(query: string): Promise<HandleInfo[]>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
}

/** invoke を差し替えられる形で API を作る（テストではモックを渡す）。 */
export function createApi(call: Invoke): Api {
  async function request<T>(
    command: string,
    guard: (v: unknown) => v is T,
    args?: Record<string, unknown>,
  ): Promise<T> {
    let value: unknown;
    try {
      value = await call(command, args);
    } catch (cause) {
      throw toError(cause);
    }
    if (!guard(value)) throw new ContractError(command);
    return value;
  }

  // 場所・コマンドライン・ユーザーは毎回は送られないので、ここで覚えておいて合わせる
  let details: ReadonlyMap<string, ProcessDetails> = new Map();
  let lastRetry = Number.NEGATIVE_INFINITY;

  async function snapshot(): Promise<Snapshot> {
    const wire = await request('snapshot', isSnapshotWire);
    const rows: ProcessRowValues[] = [];
    for (const raw of wire.processes) {
      const row = decodeProcessRow(raw);
      if (row === null) throw new ContractError('snapshot');
      rows.push(row);
    }
    const now = Date.now();
    const retry = now - lastRetry >= DETAILS_RETRY_MS;
    if (retry) lastRetry = now;
    const pids = detailsToFetch(rows, details, retry);
    const received =
      pids.length === 0 ? [] : await request('process_details', isProcessDetailsList, { pids });
    details = rememberDetails(details, received, rows);
    return joinSnapshot(wire, rows, details);
  }

  return {
    snapshot,
    systemInfo: () => request('system_info', isSystemInfo),
    killProcesses: (targets) => request('kill_processes', isKillResults, { targets }),
    startupEntries: () => request('startup_entries', isStartupEntries),
    setStartupEnabled: async (id, enabled) => {
      await request('set_startup_enabled', isNull, { id, enabled });
    },
    taskmgrReplacement: () => request('taskmgr_replacement', isReplacementStatus),
    setTaskmgrReplacement: (enabled) => request('set_taskmgr_replacement', isReplacementStatus, { enabled }),
    processIcons: (exes) => request('process_icons', isProcessIcons, { exes }),
    revealFile: async (path) => {
      await request('reveal_file', isNull, { path });
    },
    setProcessPriority: (targets, priority) =>
      request('set_process_priority', isKillResults, { targets, priority }),
    setProcessAffinity: (targets, cpus) => request('set_process_affinity', isKillResults, { targets, cpus }),
    processControls: (pid) => request('process_controls', isProcessControls, { pid }),
    searchOnline: async (query) => {
      await request('search_online', isNull, { query });
    },
    suspendProcesses: (targets) => request('suspend_processes', isKillResults, { targets }),
    resumeProcesses: (targets) => request('resume_processes', isKillResults, { targets }),
    setProcessEfficiency: (targets, enabled) =>
      request('set_process_efficiency', isKillResults, { targets, enabled }),
    runTask: async (command, admin) => {
      await request('run_task', isNull, { command, admin });
    },
    appWindows: () => request('app_windows', isAppWindows),
    switchToWindow: async (pid) => {
      await request('switch_to_window', isNull, { pid });
    },
    services: () => request('services', isServices),
    controlService: async (name, action) => {
      await request('control_service', isNull, { name, action });
    },
    openServicesTool: async () => {
      await request('open_services_tool', isNull);
    },
    networkConnections: () => request('network_connections', isConnections),
    processModules: (pid) => request('process_modules', isModules, { pid }),
    findHandles: (query) => request('find_handles', isHandles, { query }),
    setAlwaysOnTop: async (enabled) => {
      await request('set_always_on_top', isNull, { enabled });
    },
  };
}

/** アプリで使う API。 */
export const api: Api = createApi((cmd, args) => invoke(cmd, args));
