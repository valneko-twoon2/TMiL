import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../model/types';
import {
  DETAIL_NUMERIC,
  detailValue,
  GROUP_NUMERIC,
  groupValue,
  selectedTargets,
  toKillTarget,
} from './columns';
import { displayName, filterProcesses, groupProcesses, nextSort, sortBy } from './process';

function proc(pid: number, name: string, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    pid,
    parentPid: null,
    name,
    exe: '',
    command: `${name} --run`,
    state: 'running',
    user: 'alice',
    cpu: 1,
    memory: 100,
    diskReadPerSec: 10,
    diskWrittenPerSec: 5,
    runTimeSecs: 0,
    startTime: 1000 + pid,
    ...extra,
  };
}

describe('groupProcesses', () => {
  describe('equivalence', () => {
    it('同じ名前（大文字小文字無視）をまとめて合計する', () => {
      const groups = groupProcesses([proc(3, 'Chrome.exe'), proc(1, 'chrome.exe'), proc(2, 'code.exe')]);
      expect(groups).toHaveLength(2);
      const chrome = groups.find((g) => g.key === 'chrome.exe');
      expect(chrome?.pids).toEqual([3, 1]);
      expect(chrome?.children.map((c) => c.pid)).toEqual([1, 3]);
      expect(chrome?.memory).toBe(200);
      expect(chrome?.diskPerSec).toBe(30);
      expect(chrome?.name).toBe('Chrome');
    });

    it('表示名から .exe を外す', () => {
      expect(displayName('App.EXE')).toBe('App');
      expect(displayName('bash')).toBe('bash');
    });
  });

  describe('boundary', () => {
    it('空の一覧', () => {
      expect(groupProcesses([])).toEqual([]);
    });

    it('CPU の合計は 100 で頭打ち', () => {
      const groups = groupProcesses([proc(1, 'a', { cpu: 70 }), proc(2, 'a', { cpu: 50 })]);
      expect(groups[0]?.cpu).toBe(100);
    });
  });
});

describe('filterProcesses', () => {
  const list = [proc(1, 'chrome.exe'), proc(42, 'code.exe', { user: 'Bob', command: 'code --wait' })];

  describe('equivalence', () => {
    it.each([
      ['CHROME', [1]],
      ['bob', [42]],
      ['--wait', [42]],
      ['42', [42]],
    ])('%s で絞り込む', (q, pids) => {
      expect(filterProcesses(list, q).map((p) => p.pid)).toEqual(pids);
    });
  });

  describe('boundary', () => {
    it('空白だけなら全件', () => {
      expect(filterProcesses(list, '   ')).toHaveLength(2);
    });

    it('PID は完全一致だけ（部分一致しない）', () => {
      expect(filterProcesses(list, '4')).toEqual([]);
    });
  });
});

describe('nextSort / sortBy', () => {
  describe('equivalence', () => {
    it('同じ列なら向きを反転する', () => {
      expect(nextSort({ key: 'cpu', direction: 'desc' }, 'cpu', GROUP_NUMERIC)).toEqual({
        key: 'cpu',
        direction: 'asc',
      });
      expect(nextSort({ key: 'cpu', direction: 'asc' }, 'cpu', GROUP_NUMERIC).direction).toBe('desc');
    });

    it('数値の列は降順、文字の列は昇順から始める', () => {
      expect(nextSort({ key: 'name', direction: 'asc' }, 'memory', GROUP_NUMERIC).direction).toBe('desc');
      expect(nextSort({ key: 'cpu', direction: 'asc' }, 'name', GROUP_NUMERIC).direction).toBe('asc');
    });

    it('数値と文字列を並べ替える', () => {
      const rows = [
        { n: 2, s: 'b10' },
        { n: 10, s: 'b2' },
        { n: 1, s: 'a' },
      ];
      expect(sortBy(rows, { key: 'n', direction: 'asc' }, (r, k) => r[k as 'n']).map((r) => r.n)).toEqual([
        1, 2, 10,
      ]);
      expect(sortBy(rows, { key: 's', direction: 'asc' }, (r, k) => r[k as 's']).map((r) => r.s)).toEqual([
        'a',
        'b2',
        'b10',
      ]);
    });
  });

  describe('boundary', () => {
    it('同じ値は元の順を保つ（降順でも）', () => {
      const rows = [
        { id: 'x', v: 1 },
        { id: 'y', v: 1 },
      ];
      expect(sortBy(rows, { key: 'v', direction: 'desc' }, (r) => r.v).map((r) => r.id)).toEqual(['x', 'y']);
    });

    it('null は向きに関係なく後ろ', () => {
      const rows = [{ v: null }, { v: 3 }, { v: 1 }];
      expect(sortBy(rows, { key: 'v', direction: 'asc' }, (r) => r.v).map((r) => r.v)).toEqual([1, 3, null]);
      expect(sortBy(rows, { key: 'v', direction: 'desc' }, (r) => r.v).map((r) => r.v)).toEqual([null, 3, 1]);
    });

    it('元の配列は変えない', () => {
      const rows = [{ v: 2 }, { v: 1 }];
      sortBy(rows, { key: 'v', direction: 'asc' }, (r) => r.v);
      expect(rows.map((r) => r.v)).toEqual([2, 1]);
    });
  });
});

describe('columns', () => {
  const p = proc(7, 'a.exe', { cpu: 3, memory: 9, state: 'stopped' });

  describe('equivalence', () => {
    it('詳細タブの各列の値', () => {
      expect(DETAIL_NUMERIC.map((c) => detailValue(p, c))).toEqual([7, 3, 9, 15]);
      expect(detailValue(p, 'name')).toBe('a.exe');
      expect(detailValue(p, 'state')).toBe('stopped');
      expect(detailValue(p, 'user')).toBe('alice');
      expect(detailValue(p, 'command')).toBe('a.exe --run');
    });

    it('プロセス タブの各列の値', () => {
      const [g] = groupProcesses([p]);
      if (!g) throw new Error('group');
      expect(groupValue(g, 'name')).toBe('a');
      expect(groupValue(g, 'cpu')).toBe(3);
      expect(groupValue(g, 'memory')).toBe(9);
      expect(groupValue(g, 'disk')).toBe(15);
    });

    it('選択から終了対象を求める（起動時刻つき）', () => {
      const groups = groupProcesses([proc(1, 'a'), proc(2, 'a'), proc(3, 'b')]);
      expect(selectedTargets({ kind: 'group', key: 'a' }, groups)).toEqual([
        { pid: 1, startTime: 1001 },
        { pid: 2, startTime: 1002 },
      ]);
      expect(selectedTargets({ kind: 'process', pid: 3 }, groups)).toEqual([{ pid: 3, startTime: 1003 }]);
      expect(toKillTarget(proc(9, 'x'))).toEqual({ pid: 9, startTime: 1009 });
    });
  });

  describe('boundary', () => {
    it('選択なし・一覧から消えたものは対象外', () => {
      const groups = groupProcesses([proc(1, 'a')]);
      expect(selectedTargets(null, groups)).toEqual([]);
      expect(selectedTargets({ kind: 'group', key: 'gone' }, groups)).toEqual([]);
      expect(selectedTargets({ kind: 'process', pid: 99 }, groups)).toEqual([]);
    });
  });
});
