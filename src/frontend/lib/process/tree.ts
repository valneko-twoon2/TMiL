import type { ProcessInfo } from '../model/types';

/**
 * 根のプロセスと、その子孫すべて。子から先に並べる（親を先に終了すると子が別の親に付け替わるため）。
 * 親子の情報が壊れていて輪になっていても、同じプロセスは 1 回だけ数える。根が一覧に無ければ空。
 */
export function processTree(rootPid: number, processes: readonly ProcessInfo[]): ProcessInfo[] {
  const root = processes.find((p) => p.pid === rootPid);
  if (!root) return [];
  const children = new Map<number, ProcessInfo[]>();
  for (const p of processes) {
    if (p.parentPid === null || p.pid === p.parentPid) continue;
    const list = children.get(p.parentPid) ?? [];
    list.push(p);
    children.set(p.parentPid, list);
  }
  const ordered: ProcessInfo[] = [];
  const seen = new Set<number>();
  const visit = (p: ProcessInfo) => {
    if (seen.has(p.pid)) return;
    seen.add(p.pid);
    for (const child of children.get(p.pid) ?? []) visit(child);
    ordered.push(p);
  };
  visit(root);
  return ordered;
}
