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

    it('使用量の色は数値の列だけ', () => {
      const usage = { cpu: 50, memory: 500, disk: 1024 * 1024 * 5, gpu: 80 };
      expect(heatOf('cpu', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('memory', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('disk', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('gpu', usage, 1000)).toBeGreaterThan(0);
      expect(heatOf('name', usage, 1000)).toBe(0);
    });

    it('列は決まった順に並べ、名前は外せない', () => {
      expect(toggleProcessColumn(['name', 'cpu'], 'pid')).toEqual(['name', 'pid', 'cpu']);
      expect(toggleProcessColumn(['name', 'pid', 'cpu'], 'pid')).toEqual(['name', 'cpu']);
      expect(toggleProcessColumn(['name', 'cpu'], 'name')).toEqual(['name', 'cpu']);
    });
  });

  describe('boundary', () => {
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
