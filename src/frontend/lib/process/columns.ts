// プロセス表・詳細表の列定義と選択状態。
import type { KillTarget, ProcessInfo } from '../model/types';
import type { ProcessGroup } from './process';

export type GroupColumn = 'name' | 'cpu' | 'memory' | 'disk';
export const GROUP_NUMERIC: readonly GroupColumn[] = ['cpu', 'memory', 'disk'];

/** プロセス タブの並べ替えに使う値。 */
export function groupValue(group: ProcessGroup, column: GroupColumn): string | number {
  switch (column) {
    case 'name':
      return group.name;
    case 'cpu':
      return group.cpu;
    case 'memory':
      return group.memory;
    case 'disk':
      return group.diskPerSec;
  }
}

export type DetailColumn = 'name' | 'pid' | 'state' | 'user' | 'cpu' | 'memory' | 'disk' | 'command';
export const DETAIL_NUMERIC: readonly DetailColumn[] = ['pid', 'cpu', 'memory', 'disk'];

/** 詳細タブの並べ替えに使う値。 */
export function detailValue(p: ProcessInfo, column: DetailColumn): string | number {
  switch (column) {
    case 'name':
      return p.name;
    case 'pid':
      return p.pid;
    case 'state':
      return p.state;
    case 'user':
      return p.user;
    case 'cpu':
      return p.cpu;
    case 'memory':
      return p.memory;
    case 'disk':
      return p.diskReadPerSec + p.diskWrittenPerSec;
    case 'command':
      return p.command;
  }
}

/** 表で選んでいるもの。 */
export type Selection = { kind: 'group'; key: string } | { kind: 'process'; pid: number } | null;

/** プロセスを終了の指定に変える。 */
export function toKillTarget(p: ProcessInfo): KillTarget {
  return { pid: p.pid, startTime: p.startTime };
}

/** 選択から終了対象を求める。今の一覧に無いものは対象にしない。 */
export function selectedTargets(selection: Selection, groups: readonly ProcessGroup[]): KillTarget[] {
  if (selection === null) return [];
  if (selection.kind === 'group') {
    return groups.find((g) => g.key === selection.key)?.children.map(toKillTarget) ?? [];
  }
  const found = groups.flatMap((g) => g.children).find((p) => p.pid === selection.pid);
  return found ? [toKillTarget(found)] : [];
}
