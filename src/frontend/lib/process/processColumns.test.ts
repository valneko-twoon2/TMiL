import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import { groupProcesses, type ProcessGroup } from './process';
import {
  childText,
  DEFAULT_PROCESS_COLUMNS,
  groupName,
  groupStatus,
  groupText,
  groupUsage,
  groupValue,
  heatOf,
  isSystemProcess,
  kindLabel,
  normalizeProcessColumns,
  processKind,
  processUsage,
  sectionsOf,
  limitSections,
  POWER_LEVELS,
  powerLevel,
  tableSections,
  toggleProcessColumn,
  type ProcessCellContext,
} from './processColumns';

function proc(pid: number, name: string, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    pid,
    parentPid: null,
    name,
    exe: `C:\\Program Files\\${name}`,
    command: `${name} --x`,
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

const group = (...children: ProcessInfo[]): ProcessGroup => {
  const [g] = groupProcesses(children);
  if (!g) throw new Error('group');
  return g;
};

function ctx(extra: Partial<ProcessCellContext> = {}): ProcessCellContext {
  return {
    kind: () => 'background',
    windows: true,
    description: () => '',
    company: () => '',
    marks: () => ({ efficient: false, suspended: false }),
    memoryTotal: 1000,
    ...extra,
  };
}

describe('プロセスの種類', () => {
  describe('equivalence', () => {
    it('ウィンドウのあるものはアプリ、Windows フォルダーのものは Windows プロセス、ほかはバックグラウンド', () => {
      const windows = new Set([2]);
      expect(processKind(group(proc(1, 'a.exe'), proc(2, 'a.exe')), windows, true)).toBe('app');
      expect(
        processKind(
          group(proc(3, 'svchost.exe', { exe: 'C:\\Windows\\System32\\svchost.exe' })),
          windows,
          true,
        ),
      ).toBe('system');
      expect(processKind(group(proc(4, 'b.exe')), windows, true)).toBe('background');
    });

    it('Linux では root と実行ファイルが分からないものを OS のプロセスにする', () => {
      expect(isSystemProcess(proc(1, 'sshd', { exe: '/usr/sbin/sshd', user: 'root' }), false)).toBe(true);
      expect(isSystemProcess(proc(2, 'kworker', { exe: '' }), false)).toBe(true);
      expect(isSystemProcess(proc(3, 'firefox', { exe: '/usr/lib/firefox/firefox' }), false)).toBe(false);
      expect(kindLabel('system', false)).toBe('システム プロセス');
      expect(kindLabel('system', true)).toBe('Windows プロセス');
      expect(kindLabel('app', true)).toBe('アプリ');
      expect(kindLabel('background', false)).toBe('バックグラウンド プロセス');
    });

    it('種類ごとに本家の順で分け、空の種類は出さない', () => {
      const a = group(proc(1, 'a.exe'));
      const b = group(proc(2, 'b.exe'));
      const kinds = new Map([
        [a, 'system' as const],
        [b, 'app' as const],
      ]);
      const sections = sectionsOf([a, b], (g) => kinds.get(g) ?? 'background');
      expect(sections.map((s) => s.kind)).toEqual(['app', 'system']);
      expect(tableSections([a, b], false, () => 'app')).toEqual([{ kind: null, groups: [a, b] }]);
    });
  });

  describe('boundary', () => {
    it('ドライブ名の大小や別のドライブの Windows フォルダーも OS のものとみなす', () => {
      expect(isSystemProcess(proc(1, 'x', { exe: 'd:\\WINDOWS\\x.exe' }), true)).toBe(true);
      expect(isSystemProcess(proc(1, 'x', { exe: 'C:\\Windows2\\x.exe' }), true)).toBe(false);
      expect(isSystemProcess(proc(1, 'x', { exe: '' }), true)).toBe(true);
    });

    it('一部だけ OS のものならバックグラウンド', () => {
      const g = group(proc(1, 'a.exe', { exe: 'C:\\Windows\\a.exe' }), proc(2, 'a.exe'));
      expect(processKind(g, new Set(), true)).toBe('background');
    });

    it('少しずつ描くときは先頭から数え、見出しの数は元のまま。0 なら何も出さない', () => {
      const [a, b, c] = [1, 2, 3].map((pid) => group(proc(pid, `p${String(pid)}.exe`)));
      if (!a || !b || !c) throw new Error('group');
      const sections = [
        { kind: 'app' as const, groups: [a, b] },
        { kind: 'system' as const, groups: [c] },
      ];
      expect(limitSections(sections, 1)).toEqual([{ kind: 'app', groups: [a], count: 2 }]);
      expect(limitSections(sections, 3).map((s) => s.count)).toEqual([2, 1]);
      expect(limitSections(sections, Number.POSITIVE_INFINITY)).toHaveLength(2);
      expect(limitSections(sections, 0)).toEqual([]);
      expect(limitSections(sections, -1)).toEqual([]);
    });
  });
});

describe('プロセス タブの列', () => {
  describe('equivalence', () => {
    it('説明があれば名前の代わりに出し、発行元・PID・コマンドラインを出す', () => {
      const g = group(proc(7, 'chrome.exe'));
      const c = ctx({ description: () => 'Google Chrome', company: () => 'Google LLC' });
      expect(groupName(g, c)).toBe('Google Chrome');
      expect(groupText(g, 'publisher', c)).toBe('Google LLC');
      expect(groupText(g, 'pid', c)).toBe('7');
      expect(groupText(g, 'command', c)).toBe('chrome.exe --x');
      expect(groupText(g, 'processName', c)).toBe('chrome.exe');
      expect(groupText(g, 'type', c)).toBe('バックグラウンド プロセス');
      expect(groupText(g, 'cpu', c)).toBe('1.0%');
      expect(groupText(g, 'memory', c)).toBe('100 B');
      expect(groupText(g, 'disk', c)).toBe('15 B/秒');
    });

    it('まとめた行では PID とコマンドラインを出さず、数値は合計', () => {
      const g = group(proc(1, 'a.exe', { gpu: 3 }), proc(2, 'a.exe', { gpu: 4 }));
      expect(groupText(g, 'pid', ctx())).toBe('');
      expect(groupText(g, 'command', ctx())).toBe('');
      expect(groupValue(g, 'pid', ctx())).toBe(-1);
      expect(groupText(g, 'gpu', ctx())).toBe('7.0%');
      expect(groupUsage(g)).toEqual({ cpu: 2, memory: 200, disk: 30, gpu: 7 });
    });

    it('開いた行の名前は PID 付き、ほかの列は 1 つのプロセスとして出す', () => {
      const p = proc(9, 'a.exe');
      expect(childText(p, 'name', ctx())).toBe('a (9)');
      expect(childText(p, 'pid', ctx())).toBe('9');
      expect(processUsage(p)).toEqual({ cpu: 1, memory: 100, disk: 15, gpu: 0 });
    });

    it('状態は、まとめた全部が効率モードか中断のときだけ出す', () => {
      const a = proc(1, 'a.exe');
      const b = proc(2, 'a.exe');
      const g = group(a, b);
      const all = ctx({ marks: () => ({ efficient: true, suspended: false }) });
      const some = ctx({ marks: (p) => ({ efficient: p.pid === 1, suspended: false }) });
      expect(groupStatus(g, all)).toBe('効率モード');
      expect(groupStatus(g, some)).toBe('');
      expect(groupStatus(group(a), ctx({ marks: () => ({ efficient: false, suspended: true }) }))).toBe(
        '中断',
      );
    });

    it('まとめた行は、1 つでもメモリ増加中ならそれを出す', () => {
      const g = group(proc(1, 'a.exe'), proc(2, 'a.exe'));
      const one = ctx({ marks: (p) => ({ efficient: false, suspended: false, memoryGrowing: p.pid === 2 }) });
      expect(groupStatus(g, one)).toBe('メモリ増加中');
    });

    it('使用量の色は数値の列だけ', () => {
      const usage = { cpu: 50, memory: 500, disk: 1024 * 1024 * 5, gpu: 80 };
      expect(heatOf('cpu', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('memory', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('disk', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('gpu', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('name', usage, 1000)).toBe(0);
    });

    it('GPU エンジンはいちばん使っている子のもの、分離は全部が AppContainer のときだけ', () => {
      const g = group(
        proc(1, 'a.exe', { gpu: 2, gpuEngine: 'GPU 0 - Copy', appContainer: true }),
        proc(2, 'a.exe', { gpu: 30, gpuEngine: 'GPU 0 - 3D', appContainer: true }),
      );
      expect(groupText(g, 'gpuEngine', ctx())).toBe('GPU 0 - 3D');
      expect(groupText(g, 'isolation', ctx())).toBe('AppContainer');
      const mixed = group(proc(3, 'b.exe', { appContainer: true }), proc(4, 'b.exe'));
      expect(groupText(mixed, 'isolation', ctx())).toBe('');
      expect(groupText(mixed, 'gpuEngine', ctx())).toBe('');
    });

    it('電力消費は今の使用量、傾向は直近の平均から 5 段階で出す', () => {
      const busy = group(proc(1, 'a.exe', { cpu: 30 }));
      expect(groupText(busy, 'power', ctx())).toBe('高い');
      expect(groupText(busy, 'powerTrend', ctx({ averageCpu: () => 0.1 }))).toBe('非常に低い');
      expect(groupText(busy, 'powerTrend', ctx())).toBe('高い');
      expect(groupValue(busy, 'power', ctx())).toBe(3);
      expect(powerLevel(0, 0, 0)).toBe(0);
      expect(powerLevel(1, 0, 0)).toBe(1);
      expect(powerLevel(0, 10, 0)).toBe(2);
      expect(powerLevel(0, 0, 500 * 1024 ** 2)).toBe(4);
    });

    it('列は決まった順に並べ、名前は外せない', () => {
      expect(toggleProcessColumn(['name', 'cpu'], 'pid')).toEqual(['name', 'pid', 'cpu']);
      expect(toggleProcessColumn(['name', 'pid', 'cpu'], 'pid')).toEqual(['name', 'cpu']);
      expect(toggleProcessColumn(['name', 'cpu'], 'name')).toEqual(['name', 'cpu']);
    });
  });

  describe('boundary', () => {
    it('電力の段階の境目と、壊れた値は数えない', () => {
      expect(powerLevel(0.49, 0, 0)).toBe(0);
      expect(powerLevel(0.5, 0, 0)).toBe(1);
      expect(powerLevel(4.99, 0, 0)).toBe(1);
      expect(powerLevel(5, 0, 0)).toBe(2);
      expect(powerLevel(15, 0, 0)).toBe(3);
      expect(powerLevel(40, 0, 0)).toBe(4);
      expect(powerLevel(Number.NaN, -5, Number.POSITIVE_INFINITY)).toBe(0);
      expect(POWER_LEVELS).toHaveLength(5);
    });

    it('GPU が取れないプロセスだけなら空、説明が無ければ名前', () => {
      const g = group(proc(1, 'a.exe'));
      expect(groupText(g, 'gpu', ctx())).toBe('');
      expect(groupName(g, ctx())).toBe('a');
    });

    it('保存されていた列が壊れていれば既定、知らない列や重複は除く', () => {
      expect(normalizeProcessColumns('x')).toEqual([...DEFAULT_PROCESS_COLUMNS]);
      expect(normalizeProcessColumns(['gpu', 'nope', 'cpu', 'cpu'])).toEqual(['name', 'cpu', 'gpu']);
      expect(normalizeProcessColumns([])).toEqual(['name']);
    });

    it('子の無いまとまりの状態は空', () => {
      const empty: ProcessGroup = {
        key: 'x',
        name: 'x',
        pids: [],
        cpu: 0,
        memory: 0,
        diskPerSec: 0,
        children: [],
      };
      expect(groupStatus(empty, ctx())).toBe('');
      expect(groupText(empty, 'publisher', ctx())).toBe('');
    });
  });
});

describe('電力消費の見積もり', () => {
  describe('property', () => {
    it('使用量が増えても段階は下がらず、0〜4 に収まる', () => {
      const usage = fc.double({ min: 0, max: 200, noNaN: true });
      fc.assert(
        fc.property(usage, usage, usage, usage, (cpu, gpu, disk, more) => {
          const level = powerLevel(cpu, gpu, disk * 1024 ** 2);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(4);
          expect(powerLevel(cpu + more, gpu, disk * 1024 ** 2)).toBeGreaterThanOrEqual(level);
        }),
      );
    });
  });
});
