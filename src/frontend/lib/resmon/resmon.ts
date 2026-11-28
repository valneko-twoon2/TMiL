import { formatBytes, formatPercent } from '../format/format';
import type { Connection, DiskStats, HandleInfo, ModuleInfo, ProcessInfo, TcpState } from '../model/types';
import type { TableColumn } from '../table/table';

export const RESMON_TABS = [
  { id: 'overview', label: '概要' },
  { id: 'cpu', label: 'CPU' },
  { id: 'memory', label: 'メモリ' },
  { id: 'disk', label: 'ディスク' },
  { id: 'network', label: 'ネットワーク' },
] as const;
export type ResmonTab = (typeof RESMON_TABS)[number]['id'];

const TCP_STATE_LABEL: Record<TcpState, string> = {
  listen: '待ち受け',
  established: '接続済み',
  synSent: '接続中（SYN 送信）',
  synReceived: '接続中（SYN 受信）',
  finWait1: '切断中（FIN_WAIT_1）',
  finWait2: '切断中（FIN_WAIT_2）',
  timeWait: '切断待ち（TIME_WAIT）',
  closeWait: '切断待ち（CLOSE_WAIT）',
  lastAck: '切断中（LAST_ACK）',
  closing: '切断中（CLOSING）',
  closed: '切断済み',
};

export function tcpStateLabel(state: TcpState | null): string {
  return state === null ? '' : TCP_STATE_LABEL[state];
}

export function onlyChecked<T>(
  rows: readonly T[],
  pidOf: (row: T) => number | null,
  checked: ReadonlySet<number>,
): T[] {
  if (checked.size === 0) return [...rows];
  return rows.filter((row) => {
    const pid = pidOf(row);
    return pid !== null && checked.has(pid);
  });
}

export function isListening(c: Connection): boolean {
  return c.protocol === 'udp' || c.state === 'listen';
}

export function connectionCounts(connections: readonly Connection[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of connections) {
    if (c.pid === null || isListening(c)) continue;
    counts.set(c.pid, (counts.get(c.pid) ?? 0) + 1);
  }
  return counts;
}

export function connectionMatches(
  c: Connection,
  query: string,
  image: (pid: number | null) => string,
): boolean {
  const q = query.trim().toLowerCase().replace(/^:/, '');
  if (q === '') return true;
  if (/^\d+$/.test(q)) {
    const port = Number(q);
    return c.localPort === port || c.remotePort === port;
  }
  const texts = [c.localAddress, c.remoteAddress, image(c.pid), c.pid === null ? '' : String(c.pid)];
  return texts.some((t) => t.toLowerCase().includes(q));
}

export function networkProcesses(
  processes: readonly ProcessInfo[],
  connections: readonly Connection[],
): ProcessInfo[] {
  const pids = new Set(connections.flatMap((c) => (c.pid === null ? [] : [c.pid])));
  return processes.filter((p) => pids.has(p.pid));
}

export function diskProcesses(
  processes: readonly ProcessInfo[],
  checked: ReadonlySet<number>,
): ProcessInfo[] {
  return processes.filter((p) => p.diskReadPerSec + p.diskWrittenPerSec > 0 || checked.has(p.pid));
}

export function connectionKey(c: Connection): string {
  return [c.protocol, c.localAddress, c.localPort, c.remoteAddress, c.remotePort, c.pid ?? '-'].join('|');
}

export function uniqueConnections(connections: readonly Connection[]): Connection[] {
  const seen = new Set<string>();
  return connections.filter((c) => {
    const key = connectionKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function imageNames(processes: readonly ProcessInfo[]): (pid: number | null) => string {
  const names = new Map(processes.map((p) => [p.pid, p.name]));
  return (pid) => (pid === null ? '（不明）' : (names.get(pid) ?? String(pid)));
}

const pidColumn = <T extends { pid: number | null }>(): TableColumn<T> => ({
  key: 'pid',
  label: 'PID',
  numeric: true,
  width: 70,
  value: (r) => r.pid ?? -1,
  text: (r) => (r.pid === null ? '' : String(r.pid)),
});

export function tcpColumns(image: (pid: number | null) => string): TableColumn<Connection>[] {
  return [
    { key: 'image', label: 'イメージ', width: 160, value: (c) => image(c.pid) },
    pidColumn<Connection>(),
    { key: 'localAddress', label: 'ローカル アドレス', width: 150, value: (c) => c.localAddress },
    { key: 'localPort', label: 'ローカル ポート', numeric: true, width: 100, value: (c) => c.localPort },
    { key: 'remoteAddress', label: 'リモート アドレス', width: 150, value: (c) => c.remoteAddress },
    { key: 'remotePort', label: 'リモート ポート', numeric: true, width: 100, value: (c) => c.remotePort },
    { key: 'state', label: '状態', width: 160, value: (c) => tcpStateLabel(c.state) },
  ];
}

export function listenColumns(image: (pid: number | null) => string): TableColumn<Connection>[] {
  return [
    { key: 'image', label: 'イメージ', width: 160, value: (c) => image(c.pid) },
    pidColumn<Connection>(),
    { key: 'address', label: 'アドレス', width: 160, value: (c) => c.localAddress },
    { key: 'port', label: 'ポート', numeric: true, width: 80, value: (c) => c.localPort },
    { key: 'protocol', label: 'プロトコル', width: 90, value: (c) => c.protocol.toUpperCase() },
  ];
}

export function handleColumns(image: (pid: number | null) => string): TableColumn<HandleInfo>[] {
  return [
    { key: 'image', label: 'イメージ', width: 160, value: (h) => image(h.pid) },
    { key: 'pid', label: 'PID', numeric: true, width: 70, value: (h) => h.pid },
    { key: 'path', label: 'ハンドル名', width: 420, value: (h) => h.path, muted: true },
  ];
}

export function handleKey(h: HandleInfo): string {
  return `${String(h.pid)}:${h.path}`;
}

export interface ModuleRow extends ModuleInfo {
  pid: number;
  image: string;
}

export function moduleRows(
  list: readonly { pid: number; name: string; modules: readonly ModuleInfo[] }[],
): ModuleRow[] {
  return list.flatMap((entry) => entry.modules.map((m) => ({ ...m, pid: entry.pid, image: entry.name })));
}

export const MODULE_COLUMNS: readonly TableColumn<ModuleRow>[] = [
  { key: 'image', label: 'イメージ', width: 150, value: (m) => m.image },
  { key: 'pid', label: 'PID', numeric: true, width: 70, value: (m) => m.pid },
  { key: 'name', label: 'モジュール名', width: 180, value: (m) => m.name },
  { key: 'version', label: 'バージョン', width: 120, value: (m) => m.version ?? '' },
  { key: 'path', label: 'フル パス', width: 360, value: (m) => m.path, muted: true },
];

export const STORAGE_COLUMNS: readonly TableColumn<DiskStats>[] = [
  { key: 'mountPoint', label: '論理ディスク', width: 140, value: (d) => d.mountPoint },
  { key: 'name', label: '物理ディスク', width: 200, value: (d) => d.name },
  { key: 'fileSystem', label: 'ファイル システム', width: 110, value: (d) => d.fileSystem },
  {
    key: 'available',
    label: '利用可能な領域',
    numeric: true,
    width: 120,
    value: (d) => d.available,
    text: (d) => formatBytes(d.available),
  },
  {
    key: 'total',
    label: '合計',
    numeric: true,
    width: 110,
    value: (d) => d.total,
    text: (d) => formatBytes(d.total),
  },
  {
    key: 'free',
    label: '空き領域の割合',
    numeric: true,
    width: 110,
    value: (d) => (d.total > 0 ? (d.available / d.total) * 100 : 0),
    text: (d) => formatPercent(d.total > 0 ? (d.available / d.total) * 100 : 0),
  },
];

/** 推移を足し合わせる（長さが違うときは新しい側＝末尾をそろえる）。 */
export function sumSeries(series: readonly (readonly number[])[]): number[] {
  const length = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length }, (_, i) =>
    series.reduce((sum, s) => sum + (s[s.length - length + i] ?? 0), 0),
  );
}
