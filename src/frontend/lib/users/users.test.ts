import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS, processExtrasArb, snapshotFixture } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import { cellText } from '../table/table';
import { filterUsers, groupByUser, UNKNOWN_USER, userColumns } from './users';

function base(): ProcessInfo {
  const p = snapshotFixture().processes[0];
  if (!p) throw new Error('fixture');
  return p;
}

function proc(pid: number, user: string, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    ...base(),
    ...PROCESS_EXTRAS,
    pid,
    user,
    cpu: 30,
    memory: 100,
    diskReadPerSec: 1,
    diskWrittenPerSec: 2,
    ...extra,
  };
}

describe('ユーザーごとのまとめ', () => {
  describe('equivalence', () => {
    it('ユーザーごとに数と使用量を足し、セッションは重ならないように小さい順', () => {
      const rows = groupByUser([
        proc(1, 'alice', { sessionId: 2, gpu: 5 }),
        proc(2, 'alice', { sessionId: 1 }),
        proc(3, 'alice', { sessionId: 2 }),
        proc(4, 'bob'),
      ]);
      const alice = rows.find((r) => r.key === 'alice');
      expect(alice?.processes.map((p) => p.pid)).toEqual([1, 2, 3]);
      expect(alice?.sessions).toEqual([1, 2]);
      expect(alice?.memory).toBe(300);
      expect(alice?.diskPerSec).toBe(9);
      expect(alice?.gpu).toBe(5);
      expect(rows.find((r) => r.key === 'bob')?.sessions).toEqual([]);
    });

    it('名前で絞り込む（大文字小文字は区別しない）', () => {
      const rows = groupByUser([proc(1, 'Alice'), proc(2, 'bob')]);
      expect(filterUsers(rows, 'ALI').map((r) => r.name)).toEqual(['Alice']);
      expect(filterUsers(rows, '  ')).toHaveLength(2);
    });

    it('表の列は名前・セッション・数・使用量', () => {
      const [row] = groupByUser([proc(1, 'alice', { sessionId: 3 })]);
      if (!row) throw new Error('row');
      const cols = userColumns(1000);
      expect(cols.map((c) => c.label)).toEqual([
        'ユーザー',
        'セッション',
        'プロセス',
        'CPU',
        'メモリ',
        'ディスク',
        'GPU',
      ]);
      expect(cols.map((c) => cellText(c, row))).toEqual([
        'alice',
        '3',
        '1',
        '30.0%',
        '100 B',
        '3 B/秒',
        '0.0%',
      ]);
      expect(cols.map((c) => c.heat?.(row) ?? 0).some((h) => h > 0)).toBe(true);
    });
  });

  describe('boundary', () => {
    it('ユーザーが分からないものは「不明」にまとめる', () => {
      const [row] = groupByUser([proc(1, '')]);
      expect(row?.name).toBe(UNKNOWN_USER);
      expect(row?.key).toBe('');
    });

    it('CPU と GPU の合計は 100 を超えない', () => {
      const [row] = groupByUser([proc(1, 'a', { cpu: 80, gpu: 70 }), proc(2, 'a', { cpu: 80, gpu: 70 })]);
      expect(row?.cpu).toBe(100);
      expect(row?.gpu).toBe(100);
    });

    it('プロセスが無ければ空', () => {
      expect(groupByUser([])).toEqual([]);
    });
  });

  describe('property', () => {
    it('どのプロセスもちょうど 1 つのユーザーに入る', () => {
      const procArb = fc.record({
        pid: fc.nat(),
        user: fc.constantFrom('', 'alice', 'bob', 'SYSTEM'),
        sessionId: fc.option(fc.nat({ max: 5 }), { nil: null }),
      });
      fc.assert(
        fc.property(fc.array(procArb), processExtrasArb.gpu, (list, gpu) => {
          const processes = list.map((p) => proc(p.pid, p.user, { sessionId: p.sessionId, gpu }));
          const rows = groupByUser(processes);
          expect(rows.reduce((n, r) => n + r.processes.length, 0)).toBe(processes.length);
          expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
          for (const r of rows) expect(r.processes.every((p) => p.user === r.key)).toBe(true);
        }),
      );
    });
  });
});
