import { niceMax } from '../chart/chart';
import {
  formatBits,
  formatBytes,
  formatCount,
  formatFrequency,
  formatPercent,
  formatRate,
  formatUptime,
} from '../format/format';
import { shareOf } from '../format/heat';
import { diskKeys, HISTORY_CAPACITY, historyKey, type HistoryMap } from '../history/history';
import type {
  DiskKind,
  DiskStats,
  GpuStats,
  MemoryStats,
  NetworkStats,
  Snapshot,
  SystemInfo,
} from '../model/types';

export type ResourceKind = 'cpu' | 'memory' | 'disk' | 'network' | 'gpu';

export interface Series {
  label: string;
  values: readonly number[];
  color: string;
}

export interface Resource {
  id: string;
  kind: ResourceKind;
  title: string;
  summary: string;
  caption: string;
  series: Series[];
  max: number;
  axisLabel: string;
}

export interface Stat {
  label: string;
  value: string;
}

export const RESOURCE_COLORS: Record<ResourceKind, string> = {
  cpu: '#1e88e5',
  memory: '#9c27b0',
  disk: '#43a047',
  network: '#e08a00',
  gpu: '#00897b',
};

const DISK_KIND_LABEL: Record<DiskKind, string> = { ssd: 'SSD', hdd: 'HDD', unknown: '不明' };

/** ループバックの名前（Linux の lo・lo0、Windows の Loopback Pseudo-Interface）。名前全体で判定する。 */
const LOOPBACK = /^(lo\d*|loopback\b.*)$/i;

export function visibleNetworks(networks: readonly NetworkStats[]): NetworkStats[] {
  return networks.filter(
    (n) => !LOOPBACK.test(n.name) && n.totalReceived + n.totalTransmitted + n.receivedPerSec > 0,
  );
}

export function historySpanLabel(intervalMs: number): string {
  if (intervalMs <= 0) return `直近 ${String(HISTORY_CAPACITY)} 回`;
  return `${String((intervalMs * HISTORY_CAPACITY) / 1000)} 秒`;
}

export function buildResources(snapshot: Snapshot, history: HistoryMap, info: SystemInfo | null): Resource[] {
  const get = (key: string) => history.get(key) ?? [];
  const { cpu, memory } = snapshot;
  const resources: Resource[] = [
    {
      id: 'cpu',
      kind: 'cpu',
      title: 'CPU',
      summary: `${formatPercent(cpu.usage, 0)}  ${formatFrequency(cpu.frequencyMhz)}`,
      caption: info?.cpuBrand ?? '',
      series: [{ label: '使用率', values: get(historyKey.cpu), color: RESOURCE_COLORS.cpu }],
      max: 100,
      axisLabel: '% 使用率',
    },
    {
      id: 'memory',
      kind: 'memory',
      title: 'メモリ',
      summary: `${formatBytes(memory.used)} / ${formatBytes(memory.total)} (${formatPercent(shareOf(memory.used, memory.total), 0)})`,
      caption: formatBytes(memory.total),
      series: [{ label: '使用中', values: get(historyKey.memory), color: RESOURCE_COLORS.memory }],
      max: 100,
      axisLabel: 'メモリ使用量',
    },
  ];

  const keys = diskKeys(snapshot.disks);
  snapshot.disks.forEach((d, i) => {
    const key = keys[i] ?? d.mountPoint;
    const read = get(historyKey.diskRead(key));
    const write = get(historyKey.diskWrite(key));
    resources.push({
      id: `disk:${key}`,
      kind: 'disk',
      title: `ディスク ${String(i)} (${d.mountPoint})`,
      summary: `${DISK_KIND_LABEL[d.kind]}  ${formatRate(d.readPerSec + d.writtenPerSec)}`,
      caption: d.name,
      series: [
        { label: '読み取り', values: read, color: RESOURCE_COLORS.disk },
        { label: '書き込み', values: write, color: '#a5d6a7' },
      ],
      max: niceMax([...read, ...write], 1024),
      axisLabel: '転送速度',
    });
  });

  snapshot.gpus.forEach((g, i) => {
    resources.push(gpuResource(g, i, get(historyKey.gpu(i)), get(historyKey.gpuMemory(i))));
  });

  for (const n of visibleNetworks(snapshot.networks)) {
    const rx = get(historyKey.netReceive(n.name));
    const tx = get(historyKey.netTransmit(n.name));
    resources.push({
      id: `net:${n.name}`,
      kind: 'network',
      title: `ネットワーク`,
      summary: `送信: ${formatBits(n.transmittedPerSec)} 受信: ${formatBits(n.receivedPerSec)}`,
      caption: n.name,
      series: [
        { label: '受信', values: rx, color: RESOURCE_COLORS.network },
        { label: '送信', values: tx, color: '#ffcc80' },
      ],
      max: niceMax([...rx, ...tx], 1024),
      axisLabel: 'スループット',
    });
  }
  return resources;
}

function gpuResource(g: GpuStats, i: number, usage: readonly number[], memory: readonly number[]): Resource {
  return {
    id: `gpu:${String(i)}`,
    kind: 'gpu',
    title: `GPU ${String(i)}`,
    summary: `${g.name}  ${g.usage === null ? '-' : formatPercent(g.usage, 0)}`,
    caption: g.name,
    series: [
      { label: '使用率', values: usage, color: RESOURCE_COLORS.gpu },
      { label: '専用 GPU メモリ', values: memory, color: '#80cbc4' },
    ],
    max: 100,
    axisLabel: '% 使用率',
  };
}

export function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

export interface MemoryPart {
  label: string;
  bytes: number;
  color: string;
}

/** メモリの構成（使用中・キャッシュ・空き）。Windows では空きとキャッシュを分けられないので「利用可能」にまとめる。 */
export function memoryParts(m: MemoryStats): MemoryPart[] {
  const cached = Math.max(0, m.available - m.free);
  const parts: MemoryPart[] = [{ label: '使用中', bytes: m.used, color: RESOURCE_COLORS.memory }];
  if (cached > 0 && m.free < m.available) {
    parts.push({ label: 'キャッシュ済み', bytes: cached, color: '#ce93d8' });
    parts.push({ label: '空き', bytes: m.free, color: 'transparent' });
  } else {
    parts.push({ label: '利用可能', bytes: m.available, color: 'transparent' });
  }
  return parts;
}

export function statsText(resource: Resource, stats: readonly Stat[]): string {
  const head = [resource.title, resource.caption].filter((s) => s !== '').join('\n');
  return [head, '', ...stats.map((s) => `${s.label}\t${s.value}`)].join('\n');
}

function addresses(n: NetworkStats, v6: boolean): string {
  const list = n.addresses.map((a) => a.split('/')[0] ?? a).filter((a) => a.includes(':') === v6);
  return list.length === 0 ? '-' : list.join(', ');
}

const orDash = (text: string) => (text === '' ? '-' : text);
const countOrDash = (n: number | null) => (n === null ? '-' : formatCount(n));

function cpuStats(snapshot: Snapshot, info: SystemInfo | null): Stat[] {
  const cores = info?.physicalCores ?? null;
  return [
    { label: '使用率', value: formatPercent(snapshot.cpu.usage, 0) },
    { label: '速度', value: formatFrequency(snapshot.cpu.frequencyMhz) },
    { label: 'プロセス', value: String(snapshot.cpu.processCount) },
    { label: 'スレッド', value: countOrDash(sumKnown(snapshot.processes.map((p) => p.threads))) },
    { label: 'ハンドル', value: countOrDash(sumKnown(snapshot.processes.map((p) => p.handles))) },
    { label: '稼働時間', value: formatUptime(snapshot.cpu.uptimeSecs) },
    { label: 'コア', value: cores === null ? '-' : String(cores) },
    { label: '論理プロセッサ数', value: String(info?.logicalCores ?? snapshot.cpu.perCore.length) },
  ];
}

function memoryStats(m: MemoryStats): Stat[] {
  return [
    { label: '使用中', value: formatBytes(m.used) },
    { label: '利用可能', value: formatBytes(m.available) },
    { label: '合計', value: formatBytes(m.total) },
    { label: 'スワップ', value: `${formatBytes(m.swapUsed)} / ${formatBytes(m.swapTotal)}` },
    ...memoryParts(m)
      .filter((part) => part.label === 'キャッシュ済み' || part.label === '空き')
      .map((part) => ({ label: part.label, value: formatBytes(part.bytes) })),
  ];
}

function gpuStats(g: GpuStats): Stat[] {
  const memory =
    g.memoryTotal === null ? '-' : `${formatBytes(g.memoryUsed ?? 0)} / ${formatBytes(g.memoryTotal)}`;
  return [
    { label: '使用率', value: g.usage === null ? '-' : formatPercent(g.usage, 0) },
    { label: '専用 GPU メモリ', value: memory },
    { label: '名前', value: orDash(g.name) },
    { label: 'ベンダー', value: orDash(g.vendor) },
  ];
}

function diskStats(d: DiskStats): Stat[] {
  return [
    { label: '読み取り速度', value: formatRate(d.readPerSec) },
    { label: '書き込み速度', value: formatRate(d.writtenPerSec) },
    { label: '容量', value: formatBytes(d.total) },
    { label: '空き領域', value: formatBytes(d.available) },
    { label: '種類', value: DISK_KIND_LABEL[d.kind] },
    { label: 'ファイルシステム', value: orDash(d.fileSystem) },
  ];
}

function networkStats(n: NetworkStats): Stat[] {
  return [
    { label: '送信', value: formatBits(n.transmittedPerSec) },
    { label: '受信', value: formatBits(n.receivedPerSec) },
    { label: '送信済み（合計）', value: formatBytes(n.totalTransmitted) },
    { label: '受信済み（合計）', value: formatBytes(n.totalReceived) },
    { label: 'IPv4 アドレス', value: addresses(n, false) },
    { label: 'IPv6 アドレス', value: addresses(n, true) },
    { label: 'MAC アドレス', value: orDash(n.macAddress) },
  ];
}

export function resourceStats(resource: Resource, snapshot: Snapshot, info: SystemInfo | null): Stat[] {
  switch (resource.kind) {
    case 'cpu':
      return cpuStats(snapshot, info);
    case 'memory':
      return memoryStats(snapshot.memory);
    case 'gpu': {
      const g = snapshot.gpus.find((_, i) => `gpu:${String(i)}` === resource.id);
      return g ? gpuStats(g) : [];
    }
    case 'disk': {
      const keys = diskKeys(snapshot.disks);
      const d = snapshot.disks.find((_, i) => `disk:${keys[i] ?? ''}` === resource.id);
      return d ? diskStats(d) : [];
    }
    case 'network': {
      const n = snapshot.networks.find((x) => `net:${x.name}` === resource.id);
      return n ? networkStats(n) : [];
    }
  }
}
