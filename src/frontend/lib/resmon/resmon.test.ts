import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS, readFixture, snapshotFixture } from '../../test/fixtures';
import type { Connection, ProcessInfo, Snapshot } from '../model/types';
import { cellText } from '../table/table';
import { averageCpu, goneProcesses, NO_SAMPLES, pushSelectedTotal, recordCpu } from './average';
import {
  connectionCounts,
  connectionKey,
  connectionMatches,
  diskProcesses,
  handleColumns,
  handleKey,
  imageNames,
  isListening,
  listenColumns,
  MODULE_COLUMNS,
  moduleRows,
  networkProcesses,
  onlyChecked,
  STORAGE_COLUMNS,
  sumSeries,
  tcpColumns,
  tcpStateLabel,
  uniqueConnections,
} from './resmon';

function proc(pid: number, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  const base = snapshotFixture().processes[0];
  if (!base) throw new Error('fixture');
  return { ...base, ...PROCESS_EXTRAS, pid, name: `p${String(pid)}.exe`, cpu: 10, ...extra };
}

const conn = (extra: Partial<Connection> = {}): Connection => ({
  protocol: 'tcp',
  localAddress: '192.168.1.2',
  localPort: 50000,
  remoteAddress: '203.0.113.5',
  remotePort: 443,
  state: 'established',
  pid: 1,
  ...extra,
});

const snap = (at: number, processes: ProcessInfo[]): Snapshot => ({
  ...snapshotFixture(),
  timestampMs: at,
  processes,
});

describe('リソース モニター', () => {
  describe('equivalence', () => {
    it('数字はポート、それ以外はアドレス・イメージ名・PID で接続を探す', () => {
      const image = (pid: number | null) => (pid === 7 ? 'node.exe' : '');
      const c = conn({ localPort: 3000, remotePort: 443, pid: 7, localAddress: '127.0.0.1' });
      expect(connectionMatches(c, '3000', image)).toBe(true);
      expect(connectionMatches(c, ':443', image)).toBe(true);
      expect(connectionMatches(c, '30', image)).toBe(false);
      expect(connectionMatches(c, '127.0.0', image)).toBe(true);
      expect(connectionMatches(c, 'NODE', image)).toBe(true);
      expect(connectionMatches(c, 'python', image)).toBe(false);
    });

    it('ハンドルの表はイメージ名・PID・場所を出し、鍵は PID と場所', () => {
      const h = { pid: 7, path: '/home/me/a.txt' };
      const cols = handleColumns(() => 'node');
      expect(cols.map((col) => cellText(col, h))).toEqual(['node', '7', '/home/me/a.txt']);
      expect(handleKey(h)).toBe('7:/home/me/a.txt');
    });

    it('チェックしたものがあれば、そのプロセスの行だけにする', () => {
      const rows = [conn({ pid: 1 }), conn({ pid: 2 }), conn({ pid: null })];
      expect(onlyChecked(rows, (c) => c.pid, new Set())).toHaveLength(3);
      expect(onlyChecked(rows, (c) => c.pid, new Set([2])).map((c) => c.pid)).toEqual([2]);
    });

    it('接続の数は待ち受けを数えず、接続か待ち受けのあるプロセスを選ぶ', () => {
      const list = [
        conn({ pid: 1 }),
        conn({ pid: 1, localPort: 2 }),
        conn({ pid: 2, state: 'listen' }),
        conn({ protocol: 'udp', state: null, pid: 3 }),
      ];
      expect([...connectionCounts(list)]).toEqual([[1, 2]]);
      expect(isListening(conn({ state: 'listen' }))).toBe(true);
      expect(isListening(conn({ protocol: 'udp', state: null }))).toBe(true);
      expect(isListening(conn())).toBe(false);
      expect(networkProcesses([proc(1), proc(2), proc(9)], list).map((p) => p.pid)).toEqual([1, 2]);
    });

    it('ディスクを使っているか、チェックしたプロセスを出す', () => {
      const list = [
        proc(1, { diskReadPerSec: 1 }),
        proc(2, { diskReadPerSec: 0, diskWrittenPerSec: 0 }),
        proc(3, { diskReadPerSec: 0, diskWrittenPerSec: 0 }),
      ];
      expect(diskProcesses(list, new Set([3])).map((p) => p.pid)).toEqual([1, 3]);
    });

    it('同じ接続は 1 つにまとめる', () => {
      const a = conn();
      expect(uniqueConnections([a, { ...a }, conn({ localPort: 1 })])).toHaveLength(2);
      expect(connectionKey(a)).not.toBe(connectionKey(conn({ pid: null })));
    });

    it('PID からイメージ名を引き、分からなければ PID か「不明」', () => {
      const image = imageNames([proc(1)]);
      expect(image(1)).toBe('p1.exe');
      expect(image(7)).toBe('7');
      expect(image(null)).toBe('（不明）');
    });

    it('接続・待ち受け・モジュール・記憶域の列', () => {
      const image = imageNames([proc(1)]);
      expect(tcpColumns(image).map((c) => cellText(c, conn()))).toEqual([
        'p1.exe',
        '1',
        '192.168.1.2',
        '50000',
        '203.0.113.5',
        '443',
        '接続済み',
      ]);
      expect(
        listenColumns(image).map((c) => cellText(c, conn({ protocol: 'udp', state: null, pid: null }))),
      ).toEqual(['（不明）', '', '192.168.1.2', '50000', 'UDP']);
      const rows = moduleRows([
        { pid: 1, name: 'a.exe', modules: [{ name: 'x.dll', path: 'C:\\x.dll', version: null }] },
      ]);
      expect(MODULE_COLUMNS.map((c) => cellText(c, rows[0] ?? ({} as never)))).toEqual([
        'a.exe',
        '1',
        'x.dll',
        '',
        'C:\\x.dll',
      ]);
      const disk = snapshotFixture().disks[0];
      if (!disk) throw new Error('fixture');
      expect(STORAGE_COLUMNS.map((c) => cellText(c, disk)).slice(0, 2)).toEqual([disk.mountPoint, disk.name]);
    });

    it('TCP の状態をすべて言葉にする', () => {
      const states = (readFixture('connections') as Connection[]).map((c) => c.state);
      for (const state of states) {
        if (state !== null) expect(tcpStateLabel(state)).not.toBe('');
      }
      expect(tcpStateLabel(null)).toBe('');
    });

    it('推移は末尾をそろえて足し合わせる', () => {
      expect(
        sumSeries([
          [1, 2, 3],
          [10, 20],
        ]),
      ).toEqual([1, 12, 23]);
    });

    it('平均 CPU は直近 60 秒の平均で、古いものと消えたプロセスは捨てる', () => {
      let samples = recordCpu(NO_SAMPLES, snap(0, [proc(1, { cpu: 10 }), proc(2, { cpu: 4 })]));
      samples = recordCpu(samples, snap(30_000, [proc(1, { cpu: 20 })]));
      expect(averageCpu(samples, 1)).toBe(15);
      expect(averageCpu(samples, 2)).toBeNull();
      samples = recordCpu(samples, snap(60_000, [proc(1, { cpu: 30 })]));
      expect(averageCpu(samples, 1)).toBe(25);
    });

    it('選んだプロセスの CPU 使用率の合計を推移に足し、消えたプロセスを見つける', () => {
      const s = snap(0, [proc(1, { cpu: 70 }), proc(2, { cpu: 50 }), proc(3, { cpu: 1 })]);
      expect(pushSelectedTotal([], s, new Set([1, 3]))).toEqual([71]);
      expect(pushSelectedTotal([], s, new Set([1, 2]))).toEqual([100]);
      expect(goneProcesses([1, 9], s)).toEqual([9]);
    });
  });

  describe('boundary', () => {
    it('空の推移・空の一覧・記録の無いプロセス', () => {
      expect(sumSeries([])).toEqual([]);
      expect(sumSeries([[], []])).toEqual([]);
      expect(connectionCounts([]).size).toBe(0);
      expect(averageCpu(NO_SAMPLES, 1)).toBeNull();
      expect(moduleRows([])).toEqual([]);
    });

    it('空の検索は全部に合い、PID の分からない接続は PID では合わない', () => {
      const none = () => '';
      expect(connectionMatches(conn(), '   ', none)).toBe(true);
      expect(connectionMatches(conn(), ':', none)).toBe(true);
      expect(connectionMatches(conn({ pid: null }), '1', none)).toBe(false);
      expect(connectionMatches(conn({ localPort: 0, remotePort: 0 }), '0', none)).toBe(true);
      expect(connectionMatches(conn({ localPort: 65535 }), '65535', none)).toBe(true);
    });

    it('ちょうど 60 秒前の記録は平均に入れない', () => {
      let samples = recordCpu(NO_SAMPLES, snap(0, [proc(1, { cpu: 100 })]));
      samples = recordCpu(samples, snap(60_000, [proc(1, { cpu: 0 })]));
      expect(averageCpu(samples, 1)).toBe(0);
    });

    it('容量の決まった推移は古いものから捨てる', () => {
      const s = snap(0, [proc(1, { cpu: 5 })]);
      expect(pushSelectedTotal([1, 2, 3], s, new Set([1]), 3)).toEqual([2, 3, 5]);
    });

    it('合計 0 のディスクは空き領域の割合を 0 にする', () => {
      const disk = { ...snapshotFixture().disks[0], total: 0, available: 0 } as Snapshot['disks'][number];
      const free = STORAGE_COLUMNS.find((c) => c.key === 'free');
      expect(free?.value(disk)).toBe(0);
    });
  });

  describe('property', () => {
    it('足し合わせた推移の長さはいちばん長いものと同じで、値は各推移の末尾の合計', () => {
      fc.assert(
        fc.property(
          fc.array(fc.array(fc.nat({ max: 1000 }), { maxLength: 10 }), { maxLength: 5 }),
          (series) => {
            const sum = sumSeries(series);
            expect(sum).toHaveLength(Math.max(0, ...series.map((s) => s.length)));
            const last = series.reduce((total, s) => total + (s.at(-1) ?? 0), 0);
            if (sum.length > 0) expect(sum.at(-1)).toBe(last);
          },
        ),
      );
    });

    it('ポートで探すと、合う接続はどれもそのポートを持つ', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ localPort: fc.nat({ max: 65535 }), remotePort: fc.nat({ max: 65535 }) })),
          fc.nat({ max: 65535 }),
          (ports, port) => {
            const rows = ports
              .map((p) => conn(p))
              .filter((c) => connectionMatches(c, String(port), () => ''));
            expect(rows.every((c) => c.localPort === port || c.remotePort === port)).toBe(true);
            expect(rows).toHaveLength(
              ports.filter((p) => p.localPort === port || p.remotePort === port).length,
            );
          },
        ),
      );
    });

    it('チェックした PID で絞り込んだ行は、どれもチェックした PID を持つ', () => {
      fc.assert(
        fc.property(
          fc.array(fc.option(fc.nat({ max: 5 }), { nil: null })),
          fc.array(fc.nat({ max: 5 })),
          (pids, picked) => {
            const checked = new Set(picked);
            const rows = onlyChecked(pids, (p) => p, checked);
            if (checked.size === 0) expect(rows).toEqual(pids);
            else expect(rows.every((p) => p !== null && checked.has(p))).toBe(true);
          },
        ),
      );
    });
  });
});
