import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, recordSnapshot } from '../history/history';
import { snapshotFixture, systemInfoFixture } from '../../test/fixtures';
import { buildResources, resourceStats, visibleNetworks } from './resources';

const snapshot = snapshotFixture();
const info = systemInfoFixture();

describe('buildResources', () => {
  describe('equivalence', () => {
    it('CPU・メモリ・ディスク・ネットワークの順に並べる', () => {
      const list = buildResources(snapshot, recordSnapshot(EMPTY_HISTORY, snapshot), info);
      expect(list.map((r) => r.kind)).toEqual(['cpu', 'memory', 'disk', 'disk', 'disk', 'network']);
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

    it('ループバックと通信実績の無いインターフェースは出さない', () => {
      const nets = visibleNetworks([
        ...snapshot.networks,
        { name: 'lo', receivedPerSec: 9, transmittedPerSec: 9, totalReceived: 9, totalTransmitted: 9 },
        { name: 'wlan0', receivedPerSec: 0, transmittedPerSec: 0, totalReceived: 0, totalTransmitted: 0 },
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
