import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS, snapshotFixture } from '../../test/fixtures';
import { decodeProcessRow, encodeProcessRow, PROCESS_ROW_FIELDS } from './guards';
import type { ProcessDetails, ProcessInfo, ProcessRowValues } from './types';
import { detailsKey, detailsOf, detailsToFetch, encodeSnapshot, joinSnapshot, rememberDetails } from './wire';

function proc(pid: number, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    pid,
    parentPid: null,
    name: `p${String(pid)}.exe`,
    exe: `/usr/bin/p${String(pid)}`,
    command: `p${String(pid)} --run`,
    state: 'running',
    user: 'alice',
    cpu: 1,
    memory: 100,
    diskReadPerSec: 0,
    diskWrittenPerSec: 0,
    runTimeSecs: 0,
    startTime: 1000 + pid,
    ...PROCESS_EXTRAS,
    ...extra,
  };
}

/** 詳細（場所・コマンドライン・ユーザー）を除いた項目。 */
function withoutDetails(p: ProcessInfo): ProcessRowValues {
  const copy: Partial<ProcessInfo> = { ...p };
  delete copy.exe;
  delete copy.command;
  delete copy.user;
  return copy as ProcessRowValues;
}

const details = (p: ProcessInfo): ProcessDetails => ({
  pid: p.pid,
  startTime: p.startTime,
  exe: p.exe,
  command: p.command,
  user: p.user,
});

describe('送られてくる計測結果', () => {
  describe('equivalence', () => {
    it('配列にして戻すと元と同じ', () => {
      const p = proc(1, { gpuEngine: 'GPU 0 - 3D', efficient: true });
      const row = decodeProcessRow(encodeProcessRow(p));
      expect(row).toEqual(withoutDetails(p));
      expect(row?.gpuEngine).toBe('GPU 0 - 3D');
      expect(encodeProcessRow(p)).toHaveLength(PROCESS_ROW_FIELDS.length);
    });

    it('配列と詳細を合わせると、元の計測結果に戻る', () => {
      const snapshot = snapshotFixture();
      const wire = encodeSnapshot(snapshot, encodeProcessRow);
      const rows = wire.processes.map((r) => decodeProcessRow(r) ?? proc(0));
      const known = rememberDetails(
        new Map(),
        detailsOf(
          snapshot.processes,
          rows.map((r) => r.pid),
        ),
        rows,
      );
      expect(joinSnapshot(wire, rows, known)).toEqual(snapshot);
    });

    it('知らないプロセスだけ聞き、聞き直すときは場所かユーザーが空のものも聞く', () => {
      const a = proc(1);
      const b = proc(2, { exe: '' });
      const c = proc(3);
      const known = new Map([a, b].map((p) => [detailsKey(p), details(p)]));
      expect(detailsToFetch([a, b, c], known, false)).toEqual([3]);
      expect(detailsToFetch([a, b, c], known, true)).toEqual([2, 3]);
    });

    it('いなくなったプロセスの詳細は忘れ、PID が同じでも起動時刻が違えば別のもの', () => {
      const a = proc(1);
      const known = rememberDetails(new Map(), [details(a)], [a]);
      const reused = proc(1, { startTime: 9999 });
      expect(rememberDetails(known, [], [reused]).size).toBe(0);
      expect(detailsToFetch([reused], known, false)).toEqual([1]);
      expect(rememberDetails(known, [details(proc(5))], [a]).has(detailsKey(proc(5)))).toBe(false);
    });
  });

  describe('boundary', () => {
    it('長さや値が違う配列は読まない', () => {
      const row = encodeProcessRow(proc(1));
      expect(decodeProcessRow(row.slice(1))).toBeNull();
      expect(decodeProcessRow([...row, 0])).toBeNull();
      expect(decodeProcessRow({})).toBeNull();
      expect(decodeProcessRow(row.map((v, i) => (i === 0 ? -1 : v)))).toBeNull();
    });

    it('詳細が無いプロセスは場所・コマンドライン・ユーザーを空にする', () => {
      const snapshot = { ...snapshotFixture(), processes: [proc(1)] };
      const wire = encodeSnapshot(snapshot, encodeProcessRow);
      const rows = [decodeProcessRow(wire.processes[0]) ?? proc(0)];
      const joined = joinSnapshot(wire, rows, new Map());
      expect(joined.processes[0]).toMatchObject({ exe: '', command: '', user: '' });
      expect(detailsToFetch([], new Map(), true)).toEqual([]);
      expect(detailsOf([proc(1)], [])).toEqual([]);
    });
  });

  describe('property', () => {
    it('どんなプロセスも、配列にして戻すと詳細以外は同じ', () => {
      fc.assert(
        fc.property(fc.nat(), fc.nat(), fc.double({ min: 0, max: 100, noNaN: true }), (pid, start, cpu) => {
          const p = proc(pid, { startTime: start, cpu });
          const row = decodeProcessRow(encodeProcessRow(p));
          expect(row).toEqual(withoutDetails(p));
        }),
      );
    });
  });
});
