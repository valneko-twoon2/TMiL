import type { ProcessDetails, ProcessInfo, ProcessRowValues, Snapshot, SnapshotWire } from './types';

export const DETAILS_RETRY_MS = 10_000;

export const detailsKey = (p: Pick<ProcessInfo, 'pid' | 'startTime'>): string =>
  `${String(p.pid)}:${String(p.startTime)}`;

/** 詳細を取りに行くプロセスの PID。覚えていないもの、\`retry\` なら場所かユーザーが空のものも。 */
export function detailsToFetch(
  rows: readonly ProcessRowValues[],
  known: ReadonlyMap<string, ProcessDetails>,
  retry: boolean,
): number[] {
  return rows
    .filter((row) => {
      const details = known.get(detailsKey(row));
      if (details === undefined) return true;
      return retry && (details.exe === '' || details.user === '');
    })
    .map((row) => row.pid);
}

export function rememberDetails(
  known: ReadonlyMap<string, ProcessDetails>,
  received: readonly ProcessDetails[],
  rows: readonly ProcessRowValues[],
): Map<string, ProcessDetails> {
  const alive = new Set(rows.map(detailsKey));
  const next = new Map([...known].filter(([key]) => alive.has(key)));
  for (const d of received) {
    const key = detailsKey(d);
    if (alive.has(key)) next.set(key, d);
  }
  return next;
}

export function joinSnapshot(
  wire: SnapshotWire,
  rows: readonly ProcessRowValues[],
  known: ReadonlyMap<string, ProcessDetails>,
): Snapshot {
  const processes = rows.map((row): ProcessInfo => {
    const details = known.get(detailsKey(row));
    return { ...row, exe: details?.exe ?? '', command: details?.command ?? '', user: details?.user ?? '' };
  });
  return { ...wire, processes };
}

export function encodeSnapshot(snapshot: Snapshot, encode: (p: ProcessRowValues) => unknown[]): SnapshotWire {
  return { ...snapshot, processes: snapshot.processes.map(encode) };
}

export function detailsOf(processes: readonly ProcessInfo[], pids: readonly unknown[]): ProcessDetails[] {
  const wanted = new Set(pids);
  return processes
    .filter((p) => wanted.has(p.pid))
    .map(({ pid, startTime, exe, command, user }) => ({ pid, startTime, exe, command, user }));
}
