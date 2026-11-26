// パフォーマンス画面の左側に並べる項目と、右側に出す詳細を組み立てる。
import { niceMax } from '../chart/chart';
import {
  formatBits,
  formatBytes,
  formatFrequency,
  formatPercent,
  formatRate,
  formatUptime,
} from '../format/format';
import { shareOf } from '../format/heat';
import { historyKey, type HistoryMap } from '../history/history';
import type { DiskKind, NetworkStats, Snapshot, SystemInfo } from '../model/types';

export type ResourceKind = 'cpu' | 'memory' | 'disk' | 'network';

export interface Series {
  label: string;
  values: readonly number[];
  color: string;
}

export interface Resource {
  id: string;
  kind: ResourceKind;
  title: string;
  /** 左の一覧に出す 1 行の要約 */
  summary: string;
  /** 右上に出す補足（CPU 名など） */
  caption: string;
  series: Series[];
  /** グラフの上限 */
  max: number;
  /** グラフの単位の説明 */
  axisLabel: string;
}

export interface Stat {
  label: string;
  value: string;
}

/** 本家に寄せた色。 */
export const RESOURCE_COLORS: Record<ResourceKind, string> = {
  cpu: '#1e88e5',
  memory: '#9c27b0',
  disk: '#43a047',
  network: '#e08a00',
};

const DISK_KIND_LABEL: Record<DiskKind, string> = { ssd: 'SSD', hdd: 'HDD', unknown: '不明' };

/** 一覧に出すネットワーク（ループバックと通信実績の無いものは除く）。 */
export function visibleNetworks(networks: readonly NetworkStats[]): NetworkStats[] {
  return networks.filter(
    (n) => !/^(lo|loopback)/i.test(n.name) && n.totalReceived + n.totalTransmitted + n.receivedPerSec > 0,
  );
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

  snapshot.disks.forEach((d, i) => {
    const read = get(historyKey.diskRead(d.name));
    const write = get(historyKey.diskWrite(d.name));
    resources.push({
      id: `disk:${d.name}`,
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

/** 右側の詳細に出す数値。 */
export function resourceStats(resource: Resource, snapshot: Snapshot, info: SystemInfo | null): Stat[] {
  switch (resource.kind) {
    case 'cpu':
      return [
        { label: '使用率', value: formatPercent(snapshot.cpu.usage, 0) },
        { label: '速度', value: formatFrequency(snapshot.cpu.frequencyMhz) },
        { label: 'プロセス', value: String(snapshot.cpu.processCount) },
        { label: '稼働時間', value: formatUptime(snapshot.cpu.uptimeSecs) },
        {
          label: 'コア',
          value:
            info?.physicalCores === null || info?.physicalCores === undefined
              ? '-'
              : String(info.physicalCores),
        },
        { label: '論理プロセッサ数', value: String(info?.logicalCores ?? snapshot.cpu.perCore.length) },
      ];
    case 'memory': {
      const m = snapshot.memory;
      return [
        { label: '使用中', value: formatBytes(m.used) },
        { label: '利用可能', value: formatBytes(m.available) },
        { label: '合計', value: formatBytes(m.total) },
        { label: 'スワップ', value: `${formatBytes(m.swapUsed)} / ${formatBytes(m.swapTotal)}` },
      ];
    }
    case 'disk': {
      const d = snapshot.disks.find((x) => `disk:${x.name}` === resource.id);
      if (!d) return [];
      return [
        { label: '読み取り速度', value: formatRate(d.readPerSec) },
        { label: '書き込み速度', value: formatRate(d.writtenPerSec) },
        { label: '容量', value: formatBytes(d.total) },
        { label: '空き領域', value: formatBytes(d.available) },
        { label: '種類', value: DISK_KIND_LABEL[d.kind] },
        { label: 'ファイルシステム', value: d.fileSystem || '-' },
      ];
    }
    case 'network': {
      const n = snapshot.networks.find((x) => `net:${x.name}` === resource.id);
      if (!n) return [];
      return [
        { label: '送信', value: formatBits(n.transmittedPerSec) },
        { label: '受信', value: formatBits(n.receivedPerSec) },
        { label: '送信済み（合計）', value: formatBytes(n.totalTransmitted) },
        { label: '受信済み（合計）', value: formatBytes(n.totalReceived) },
      ];
    }
  }
}
