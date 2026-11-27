import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groupValue, PROCESS_NUMERIC } from './processColumns';
import { PROCESS_EXTRAS } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import {
  DEFAULT_DETAIL_COLUMNS,
  DETAIL_COLUMNS,
  DETAIL_NUMERIC,
  detailLabel,
  detailText,
  detailValue,
  normalizeDetailColumns,
  toggleDetailColumn,
  selectedTargets,
  toKillTarget,
} from './columns';
import { displayName, filterProcesses, groupProcesses, keepOrder, nextSort, sortBy } from './process';

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
    ...PROCESS_EXTRAS,
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
      expect(nextSort({ key: 'cpu', direction: 'desc' }, 'cpu', PROCESS_NUMERIC)).toEqual({
        key: 'cpu',
        direction: 'asc',
      });
      expect(nextSort({ key: 'cpu', direction: 'asc' }, 'cpu', PROCESS_NUMERIC).direction).toBe('desc');
    });

    it('数値の列は降順、文字の列は昇順から始める', () => {
      expect(nextSort({ key: 'name', direction: 'asc' }, 'memory', PROCESS_NUMERIC).direction).toBe('desc');
      expect(nextSort({ key: 'cpu', direction: 'asc' }, 'name', PROCESS_NUMERIC).direction).toBe('asc');
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

describe('keepOrder', () => {
  const id = (r: string) => r;

  describe('equivalence', () => {
    it('前にあった行は、並べ替えた結果が変わっても前の順のまま', () => {
      expect(keepOrder(['c', 'a', 'b'], ['a', 'b', 'c'], id)).toEqual(['a', 'b', 'c']);
    });

    it('新しい行は、並べ替えた結果での位置に入る', () => {
      expect(keepOrder(['x', 'a', 'b'], ['a', 'b'], id)).toEqual(['x', 'a', 'b']);
      expect(keepOrder(['a', 'b', 'x'], ['b', 'a'], id)).toEqual(['b', 'a', 'x']);
    });

    it('消えた行は除く', () => {
      expect(keepOrder(['b'], ['a', 'b', 'c'], id)).toEqual(['b']);
    });
  });

  describe('boundary', () => {
    it('前の並びが空なら、並べ替えた結果そのまま', () => {
      expect(keepOrder(['b', 'a'], [], id)).toEqual(['b', 'a']);
      expect(keepOrder([], ['a'], id)).toEqual([]);
    });

    it('前の並びに同じ鍵が重なっていても、行は 1 つだけ', () => {
      expect(keepOrder(['a', 'b'], ['a', 'a', 'b'], id)).toEqual(['a', 'b']);
    });
  });

  describe('property', () => {
    const keys = fc.uniqueArray(fc.string({ maxLength: 3 }), { maxLength: 30 });

    it('行の数と中身は並べ替えた結果と同じで、前にあった行どうしの順は変わらない', () => {
      fc.assert(
        fc.property(keys, keys, (sorted, previous) => {
          const result = keepOrder(sorted, previous, id);
          expect([...result].sort()).toEqual([...sorted].sort());
          const kept = previous.filter((k) => sorted.includes(k));
          expect(result.filter((k) => previous.includes(k))).toEqual(kept);
        }),
      );
    });

    it('同じ並びを渡し直しても変わらない', () => {
      fc.assert(
        fc.property(keys, keys, (sorted, previous) => {
          const once = keepOrder(sorted, previous, id);
          expect(keepOrder(sorted, once, id)).toEqual(once);
        }),
      );
    });
  });
});

describe('columns', () => {
  const p = proc(7, 'a.exe', { cpu: 3, memory: 9, state: 'stopped' });

  describe('equivalence', () => {
    it('詳細タブの各列の値', () => {
      expect(DETAIL_NUMERIC.map((c) => [c, detailValue(p, c)])).toEqual([
        ['pid', 7],
        ['cpu', 3],
        ['memory', 9],
        ['disk', 15],
        ['diskRead', 10],
        ['diskWrite', 5],
        ['parentPid', -1],
        ['runTime', 0],
        ['startTime', 1007],
        ['cpuTime', 0],
        ['commit', 0],
        // 取れない値（null）は、並べ替えで先頭に来るよう -1 にする
        ['handles', -1],
        ['threads', -1],
        ['sessionId', -1],
        ['ioRead', 0],
        ['ioWrite', 0],
        ['gpu', -1],
        ['gpuMemory', -1],
      ]);
      expect(detailValue(p, 'description')).toBe('');
      expect(detailValue(p, 'description', () => 'アプリ A')).toBe('アプリ A');
      expect(detailValue(p, 'exe')).toBe(p.exe);
      expect(detailValue(p, 'name')).toBe('a.exe');
      expect(detailValue(p, 'state')).toBe('stopped');
      expect(detailValue(p, 'user')).toBe('alice');
      expect(detailValue(p, 'command')).toBe('a.exe --run');
    });

    it('詳細タブのセルの文字', () => {
      expect(detailText(p, 'state')).toBe('中断');
      expect(detailText(p, 'cpu')).toBe('3.0%');
      expect(detailText(p, 'pid')).toBe('7');
      expect(detailText(p, 'parentPid')).toBe('');
      expect(detailText({ ...p, parentPid: 4 }, 'parentPid')).toBe('4');
      expect(detailText({ ...p, runTimeSecs: 93784 }, 'runTime')).toBe('1:02:03:04');
      expect(detailText(p, 'command')).toBe('a.exe --run');
    });

    it('すべての列に見出しと文字がある', () => {
      for (const { key, label } of DETAIL_COLUMNS) {
        expect(detailLabel(key)).toBe(label);
        expect(typeof detailText(p, key)).toBe('string');
      }
    });

    it('列を出したり隠したりできる（並びは決まった順）', () => {
      expect(toggleDetailColumn(['name', 'cpu'], 'pid')).toEqual(['name', 'pid', 'cpu']);
      expect(toggleDetailColumn(['name', 'pid', 'cpu'], 'pid')).toEqual(['name', 'cpu']);
    });

    it('プロセス タブの各列の値', () => {
      const [g] = groupProcesses([p]);
      if (!g) throw new Error('group');
      const ctx = {
        kind: () => 'background' as const,
        windows: true,
        description: () => '',
        company: () => '',
        marks: () => ({ efficient: false, suspended: false }),
        memoryTotal: 100,
      };
      expect(groupValue(g, 'name', ctx)).toBe('a');
      expect(groupValue(g, 'cpu', ctx)).toBe(3);
      expect(groupValue(g, 'memory', ctx)).toBe(9);
      expect(groupValue(g, 'disk', ctx)).toBe(15);
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

    it('名前の列は外せない', () => {
      expect(toggleDetailColumn(['name', 'pid'], 'name')).toEqual(['name', 'pid']);
    });

    it('保存された列が壊れていたら既定、空でも名前だけは出す', () => {
      expect(normalizeDetailColumns('pid')).toEqual(DEFAULT_DETAIL_COLUMNS);
      expect(normalizeDetailColumns(null)).toEqual(DEFAULT_DETAIL_COLUMNS);
      expect(normalizeDetailColumns([])).toEqual(['name']);
      expect(normalizeDetailColumns(['command', 42, 'pid'])).toEqual(['name', 'pid', 'command']);
    });

    it('全部の列を出せる', () => {
      const all = DETAIL_COLUMNS.map((c) => c.key);
      expect(normalizeDetailColumns(all)).toEqual(all);
    });

    it('開始時刻が 0 なら空', () => {
      expect(detailText(proc(1, 'a', { startTime: 0 }), 'startTime')).toBe('');
    });
  });
});

describe('プロセスの一覧（細部）', () => {
  describe('equivalence', () => {
    it('名前の大文字・小文字を区別せずに絞り込む', () => {
      // コマンドラインに名前が入っていると、そちらで当たってしまうので空にする
      const list = [proc(1, 'Chrome.exe', { command: '' }), proc(2, 'code.exe', { command: '' })];
      expect(filterProcesses(list, 'CHROME').map((p) => p.pid)).toEqual([1]);
      expect(filterProcesses(list, 'chrome').map((p) => p.pid)).toEqual([1]);
    });

    it('プロセス タブの数値の列は大きい順から並べる', () => {
      for (const key of ['cpu', 'memory', 'disk'] as const) {
        expect(nextSort({ key: 'name', direction: 'asc' }, key, PROCESS_NUMERIC).direction).toBe('desc');
      }
    });

    it('詳細タブのディスクは読み取りと書き込みの合計', () => {
      expect(detailText(proc(1, 'a', { diskReadPerSec: 1024, diskWrittenPerSec: 1024 }), 'disk')).toBe(
        '2.0 KB/秒',
      );
    });
  });

  describe('boundary', () => {
    it('同じ値のものは元の順を保つ（3 つ以上でも）', () => {
      const list = [proc(5, 'a'), proc(3, 'a'), proc(9, 'a'), proc(1, 'a')];
      expect(sortBy(list, { key: 'cpu', direction: 'desc' }, (p) => p.cpu).map((p) => p.pid)).toEqual([
        5, 3, 9, 1,
      ]);
      expect(sortBy(list, { key: 'cpu', direction: 'asc' }, (p) => p.cpu).map((p) => p.pid)).toEqual([
        5, 3, 9, 1,
      ]);
    });

    it('.exe は末尾にあるときだけ外す', () => {
      expect(displayName('setup.exe.bak')).toBe('setup.exe.bak');
      expect(displayName('App.EXE')).toBe('App');
    });
  });
});
