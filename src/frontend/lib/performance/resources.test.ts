import type { NetworkStats } from '../model/types';
import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, recordSnapshot } from '../history/history';
import { snapshotFixture, systemInfoFixture } from '../../test/fixtures';
import {
  buildResources,
  historySpanLabel,
  memoryParts,
  resourceStats,
  statsText,
  sumKnown,
  visibleNetworks,
  networkTitle,
} from './resources';

const snapshot = snapshotFixture();
const info = systemInfoFixture();

describe('buildResources', () => {
  describe('equivalence', () => {
    it('CPU・メモリ・ディスク・GPU・ネットワークの順に並べる', () => {
      const list = buildResources(snapshot, recordSnapshot(EMPTY_HISTORY, snapshot), info);
      expect(list.map((r) => r.kind)).toEqual([
        'cpu',
        'memory',
        'disk',
        'disk',
        'disk',
        'gpu',
        'gpu',
        'network',
      ]);
      expect(list[0]?.caption).toBe('Example CPU');
      expect(list[0]?.series[0]?.values).toEqual([25.5]);
      expect(list[2]?.title).toBe('ディスク 0 (/)');
    });

    it('各種類の詳細を出す', () => {
      const list = buildResources(snapshot, EMPTY_HISTORY, info);
      const byKind = (k: string) => list.find((r) => r.kind === k);
      const labels = (k: string) => {
        const r = byKind(k);
        return r ? resourceStats(r, snapshot, info).map((s) => s.label) : [];
      };
      expect(labels('cpu')).toContain('稼働時間');
      expect(labels('memory')).toContain('利用可能');
      expect(labels('disk')).toContain('ファイルシステム');
      expect(labels('network')).toContain('受信');
    });

    it('ネットワークの見出しは接続の種類で、アダプター名は下の行に出す', () => {
      expect(networkTitle('Wi-Fi 2')).toBe('Wi-Fi');
      expect(networkTitle('Intel Wireless-AC')).toBe('Wi-Fi');
      expect(networkTitle('VMware Network Adapter VMnet1')).toBe('イーサネット');
      const net = buildResources(snapshot, EMPTY_HISTORY, info).find((r) => r.kind === 'network');
      expect(net?.subtitle).toBe('eth0');
    });

    it('ループバックと通信実績の無いインターフェースは出さない', () => {
      const nets = visibleNetworks([
        ...snapshot.networks,
        network('lo', { receivedPerSec: 9, transmittedPerSec: 9, totalReceived: 9, totalTransmitted: 9 }),
        network('wlan0'),
      ]);
      expect(nets.map((n) => n.name)).toEqual(['eth0']);
    });
  });

  describe('boundary', () => {
    it('システム情報がまだ無くても組み立てられる', () => {
      const list = buildResources(snapshot, EMPTY_HISTORY, null);
      expect(list[0]?.caption).toBe('');
      const cpu = list[0];
      if (!cpu) throw new Error('cpu');
      const stats = resourceStats(cpu, snapshot, null);
      expect(stats.find((s) => s.label === 'コア')?.value).toBe('-');
      expect(stats.find((s) => s.label === '論理プロセッサ数')?.value).toBe('2');
    });

    it('物理コア数が分かればそれを出す', () => {
      const cpu = buildResources(snapshot, EMPTY_HISTORY, info)[0];
      if (!cpu) throw new Error('cpu');
      const stats = resourceStats(cpu, snapshot, { ...info, physicalCores: 4 });
      expect(stats.find((s) => s.label === 'コア')?.value).toBe('4');
    });

    it('一覧から消えたディスク・ネットワークの詳細は空', () => {
      const list = buildResources(snapshot, EMPTY_HISTORY, info);
      const disk = list.find((r) => r.kind === 'disk');
      const net = list.find((r) => r.kind === 'network');
      if (!disk || !net) throw new Error('missing');
      const empty = { ...snapshot, disks: [], networks: [] };
      expect(resourceStats(disk, empty, info)).toEqual([]);
      expect(resourceStats(net, empty, info)).toEqual([]);
    });

    it('ファイルシステムが空なら「-」', () => {
      const snap = { ...snapshot, disks: snapshot.disks.map((d) => ({ ...d, fileSystem: '' })) };
      const disk = buildResources(snap, EMPTY_HISTORY, info).find((r) => r.kind === 'disk');
      if (!disk) throw new Error('disk');
      expect(resourceStats(disk, snap, info).find((s) => s.label === 'ファイルシステム')?.value).toBe('-');
    });
  });
});

describe('visibleNetworks', () => {
  describe('regression', () => {
    // 名前が lo で始まるだけのアダプター（Local Area Connection など）までループバック扱いで消えていた
    it('lo で始まる普通のアダプターは出す', () => {
      const base = { receivedPerSec: 1, transmittedPerSec: 1, totalReceived: 1, totalTransmitted: 1 };
      const names = ['Local Area Connection', 'lowpan0', 'lo', 'lo0', 'Loopback Pseudo-Interface 1'];
      const shown = visibleNetworks(names.map((name) => network(name, base))).map((n) => n.name);
      expect(shown).toEqual(['Local Area Connection', 'lowpan0']);
    });
  });
});

describe('historySpanLabel', () => {
  describe('equivalence', () => {
    it('更新間隔 × 60 回分を秒で表す', () => {
      expect(historySpanLabel(1000)).toBe('60 秒');
      expect(historySpanLabel(4000)).toBe('240 秒');
    });
  });

  describe('boundary', () => {
    it('一時停止中は回数で表す', () => {
      expect(historySpanLabel(0)).toBe('直近 60 回');
    });
  });

  describe('regression', () => {
    // 更新間隔に関係なく「60 秒」と表示していた
    it('更新間隔 0.5 秒なら 30 秒', () => {
      expect(historySpanLabel(500)).toBe('30 秒');
    });
  });
});

const network = (name: string, extra: Partial<NetworkStats> = {}): NetworkStats => ({
  name,
  receivedPerSec: 0,
  transmittedPerSec: 0,
  totalReceived: 0,
  totalTransmitted: 0,
  macAddress: '',
  addresses: [],
  ...extra,
});

describe('パフォーマンスの一覧（細部）', () => {
  describe('snapshot', () => {
    it('すべてのリソースの見出し・詳細の文言', () => {
      const list = buildResources(snapshot, recordSnapshot(EMPTY_HISTORY, snapshot), info);
      const view = list.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        summary: r.summary,
        caption: r.caption,
        axisLabel: r.axisLabel,
        max: r.max,
        series: r.series.map((s) => `${s.label}:${s.color}:${s.values.join(',')}`),
        stats: resourceStats(r, snapshot, info),
      }));
      expect(view).toMatchSnapshot();
    });
  });

  describe('equivalence', () => {
    it('2 つ目のディスクやネットワークは、その値で詳細を出す', () => {
      const list = buildResources(snapshot, EMPTY_HISTORY, info);
      const second = list.filter((r) => r.kind === 'disk')[1];
      if (!second) throw new Error('disk');
      const disk = snapshot.disks[1];
      expect(resourceStats(second, snapshot, info).find((s) => s.label === 'ファイルシステム')?.value).toBe(
        disk?.fileSystem,
      );
      const twoNets = {
        ...snapshot,
        networks: [network('eth0', { totalReceived: 1 }), network('eth1', { totalTransmitted: 2048 })],
      };
      const net = buildResources(twoNets, EMPTY_HISTORY, info).filter((r) => r.kind === 'network')[1];
      if (!net) throw new Error('net');
      expect(resourceStats(net, twoNets, info).find((s) => s.label === '送信済み（合計）')?.value).toBe(
        '2.0 KB',
      );
    });

    it('マウントポイントが重なるディスクも、別々の履歴とキーで扱う', () => {
      const base = snapshot.disks[0];
      if (!base) throw new Error('disk');
      const twin = { ...snapshot, disks: [base, { ...base, readPerSec: 9 }] };
      const ids = buildResources(twin, EMPTY_HISTORY, info)
        .filter((r) => r.kind === 'disk')
        .map((r) => r.id);
      expect(ids).toEqual([`disk:${base.mountPoint}`, `disk:${base.mountPoint}#1`]);
    });

    it('履歴が無ければグラフは空、ネットワークの最大値は履歴から決める', () => {
      const list = buildResources(snapshot, EMPTY_HISTORY, info);
      expect(list.every((r) => r.series.every((s) => s.values.length === 0))).toBe(true);
      const history = new Map([[`net:${String(snapshot.networks[0]?.name)}:rx`, [5000]]]);
      const net = buildResources(snapshot, history, info).find((r) => r.kind === 'network');
      expect(net?.max).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('boundary', () => {
    it('物理コア数が分からない（null）なら「-」', () => {
      const cpu = buildResources(snapshot, EMPTY_HISTORY, info)[0];
      if (!cpu) throw new Error('cpu');
      const stats = resourceStats(cpu, snapshot, { ...info, physicalCores: null });
      expect(stats.find((s) => s.label === 'コア')?.value).toBe('-');
    });

    it('送信・受信のどれか 1 つでも実績があれば出す', () => {
      const names = visibleNetworks([
        network('rx-only', { totalReceived: 1 }),
        network('tx-only', { totalTransmitted: 1 }),
        network('rate-only', { receivedPerSec: 1 }),
        network('none'),
      ]).map((n) => n.name);
      expect(names).toEqual(['rx-only', 'tx-only', 'rate-only']);
    });

    it('名前の途中に lo があるだけのアダプター（wlo1 など）はループバックではない', () => {
      const names = visibleNetworks([
        network('wlo1', { totalReceived: 1 }),
        network('lo0', { totalReceived: 1 }),
      ]).map((n) => n.name);
      expect(names).toEqual(['wlo1']);
    });
  });
});

describe('メモリの構成・コピー・合計', () => {
  describe('equivalence', () => {
    it('空きが利用可能より少なければ、キャッシュと空きに分ける', () => {
      const parts = memoryParts({ total: 16, used: 8, available: 8, free: 3, swapTotal: 0, swapUsed: 0 });
      expect(parts.map((p) => [p.label, p.bytes])).toEqual([
        ['使用中', 8],
        ['キャッシュ済み', 5],
        ['空き', 3],
      ]);
    });

    it('コピーは見出しと数値を 1 行ずつ', () => {
      const resource = buildResources(snapshot, EMPTY_HISTORY, info)[0];
      if (!resource) throw new Error('resource');
      const text = statsText(resource, [
        { label: '使用率', value: '25%' },
        { label: '速度', value: '3.20 GHz' },
      ]);
      expect(text).toBe('CPU\nExample CPU\n\n使用率\t25%\n速度\t3.20 GHz');
    });

    it('取れた数だけを足す', () => {
      expect(sumKnown([1, null, 2])).toBe(3);
    });
  });

  describe('boundary', () => {
    it('Windows のように空きと利用可能が同じなら「利用可能」にまとめる', () => {
      const parts = memoryParts({ total: 16, used: 8, available: 8, free: 8, swapTotal: 0, swapUsed: 0 });
      expect(parts.map((p) => p.label)).toEqual(['使用中', '利用可能']);
    });

    it('1 つも取れなければ null', () => {
      expect(sumKnown([])).toBeNull();
      expect(sumKnown([null, null])).toBeNull();
    });
  });
});
