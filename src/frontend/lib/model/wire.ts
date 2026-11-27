// 送られてきた計測結果（項目名の無い配列）を、画面で使う形に戻す（純粋関数）。
// 場所・コマンドライン・ユーザーは毎回は送られないので、覚えておいた ProcessDetails を合わせる。
import type { ProcessDetails, ProcessInfo, ProcessRowValues, Snapshot, SnapshotWire } from './types';

/** 場所やユーザーが空のプロセスを、聞き直すまでの間（バックエンドが後から補うことがあるため） */
export const DETAILS_RETRY_MS = 10_000;

/** 同じプロセスかを見分ける鍵（PID と起動時刻）。 */
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

/** 受け取った詳細を覚え、今いないプロセスの分は忘れる。 */
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

/** 配列と詳細を合わせて、計測結果に戻す。詳細が無いプロセスは空にする。 */
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

/** 計測結果を、送る形（配列）にする。モックのバックエンドとテストで使う。 */
export function encodeSnapshot(snapshot: Snapshot, encode: (p: ProcessRowValues) => unknown[]): SnapshotWire {
  return { ...snapshot, processes: snapshot.processes.map(encode) };
}

/** 頼まれた PID の詳細。モックのバックエンドとテストで使う。 */
export function detailsOf(processes: readonly ProcessInfo[], pids: readonly unknown[]): ProcessDetails[] {
  const wanted = new Set(pids);
  return processes
    .filter((p) => wanted.has(p.pid))
    .map(({ pid, startTime, exe, command, user }) => ({ pid, startTime, exe, command, user }));
}
