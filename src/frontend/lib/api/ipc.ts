// バックエンドのコマンド呼び出し。受け取った値は契約どおりかを確かめてから返す。
import { invoke } from '@tauri-apps/api/core';
import {
  isKillResults,
  isNull,
  isProcessControls,
  isProcessIcons,
  isReplacementStatus,
  isSnapshot,
  isStartupEntries,
  isSystemInfo,
} from '../model/guards';
import type {
  KillResult,
  KillTarget,
  Priority,
  ProcessControls,
  ProcessIcon,
  ReplacementStatus,
  Snapshot,
  StartupEntry,
  SystemInfo,
} from '../model/types';

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

  return {
    snapshot: () => request('snapshot', isSnapshot),
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
  };
}

/** アプリで使う API。 */
export const api: Api = createApi((cmd, args) => invoke(cmd, args));
