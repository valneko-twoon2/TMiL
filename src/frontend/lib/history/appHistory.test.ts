import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS, snapshotFixture } from '../../test/fixtures';
import type { ProcessInfo, Snapshot } from '../model/types';
import { cellText } from '../table/table';
import {
  appHistoryColumns,
  cleared,
  filterUsage,
  newTracker,
  parseHistory,
  serializeHistory,
  totals,
  track,
  type UsageTracker,
} from './appHistory';

const T0 = 1_767_225_600_000;

function proc(pid: number, name: string, cpuTimeMs: number, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  const base = snapshotFixture().processes[0];
  if (!base) throw new Error('fixture');
  return {
    ...base,
    ...PROCESS_EXTRAS,
    pid,
    name,
    exe: `C:\\${name}`,
    startTime: 1_767_000_000,
    cpuTimeMs,
    ...extra,
  };
}

const snap = (at: number, processes: ProcessInfo[]): Snapshot => ({
  ...snapshotFixture(),
  timestampMs: at,
  processes,
});

const fresh = () => newTracker({ since: T0, apps: {} });
const cpuOf = (tracker: UsageTracker, key: string) => totals(tracker).find((a) => a.key === key)?.cpuMs;

describe('アプリの履歴', () => {
  describe('equivalence', () => {
    it('初めて見たときの値から数え、増えた分だけ足す', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'a.exe', 5000)]));
      expect(cpuOf(t, 'a.exe')).toBe(0);
      t = track(t, snap(T0 + 1000, [proc(1, 'a.exe', 7000, { diskReadTotal: 10, diskWrittenTotal: 4 })]));
      expect(cpuOf(t, 'a.exe')).toBe(2000);
      expect(totals(t).find((a) => a.key === 'a.exe')).toMatchObject({
        readBytes: 10,
        writtenBytes: 4,
        name: 'a',
      });
    });

    it('前の計測より後に起動したプロセスは 0 から数える', () => {
      let t = track(fresh(), snap(T0, []));
      const born = proc(2, 'b.exe', 300, { startTime: Math.floor(T0 / 1000) + 1 });
      t = track(t, snap(T0 + 2000, [born]));
      expect(cpuOf(t, 'b.exe')).toBe(300);
    });

    it('終わったプロセスの分は残り、同じ名前は大文字小文字を区別せずにまとめる', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'A.exe', 0), proc(2, 'a.exe', 0)]));
      t = track(t, snap(T0 + 1000, [proc(1, 'A.exe', 100), proc(2, 'a.exe', 50)]));
      t = track(t, snap(T0 + 2000, [proc(2, 'a.exe', 60)]));
      expect(cpuOf(t, 'a.exe')).toBe(160);
      expect(totals(t)).toHaveLength(1);
    });

    it('削除すると今の値から数え直す', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'a.exe', 0)]));
      t = track(t, snap(T0 + 1000, [proc(1, 'a.exe', 1000)]));
      t = cleared(t, T0 + 5000);
      expect(t.data.since).toBe(T0 + 5000);
      expect(cpuOf(t, 'a.exe')).toBe(0);
      t = track(t, snap(T0 + 6000, [proc(1, 'a.exe', 1500)]));
      expect(cpuOf(t, 'a.exe')).toBe(500);
    });

    it('保存して読み直すと、動いているプロセスの分も終わった分として残る', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'a.exe', 0)]));
      t = track(t, snap(T0 + 1000, [proc(1, 'a.exe', 800)]));
      const restored = newTracker(parseHistory(serializeHistory(t), 0));
      expect(restored.data.since).toBe(T0);
      expect(cpuOf(restored, 'a.exe')).toBe(800);
      // 読み直したあとに同じプロセスを見ても、二重には数えない
      const next = track(restored, snap(T0 + 2000, [proc(1, 'a.exe', 900)]));
      expect(cpuOf(next, 'a.exe')).toBe(800);
    });

    it('表は説明があれば説明で出し、名前で絞り込める', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'chrome.exe', 0)]));
      t = track(t, snap(T0 + 1000, [proc(1, 'chrome.exe', 3_723_000)]));
      const rows = totals(t);
      const cols = appHistoryColumns(
        () => null,
        (exe) => (exe.endsWith('chrome.exe') ? 'Google Chrome' : ''),
      );
      const row = rows[0];
      if (!row) throw new Error('row');
      expect(cols.map((c) => cellText(c, row))).toEqual(['Google Chrome', '1:02:03', '0 B', '0 B']);
      expect(filterUsage(rows, 'CHROME')).toHaveLength(1);
      expect(filterUsage(rows, 'firefox')).toHaveLength(0);
      expect(filterUsage(rows, ' ')).toHaveLength(1);
    });
  });

  describe('boundary', () => {
    it.each([null, '', '{', '[]', '{"since":-1,"apps":{}}', '{"since":1}', 'null'])(
      '壊れた保存値 %j は空の記録',
      (raw) => {
        expect(parseHistory(raw, 42)).toEqual({ since: 42, apps: {} });
      },
    );

    it('形の違うアプリの記録は捨て、ほかは読む', () => {
      const raw = JSON.stringify({
        since: 5,
        apps: {
          ok: { name: 'OK', exe: 'C:\\ok.exe', cpuMs: 1, readBytes: 2, writtenBytes: 3 },
          bad: { cpuMs: -1, readBytes: 0, writtenBytes: 0 },
          noname: { cpuMs: 1, readBytes: 0, writtenBytes: 0 },
          junk: 'x',
        },
      });
      const data = parseHistory(raw, 0);
      expect(Object.keys(data.apps).sort()).toEqual(['noname', 'ok']);
      expect(data.apps.noname).toMatchObject({ name: 'noname', exe: '' });
    });

    it('値が減った（別のプロセスに入れ替わった）ときは 0 として扱う', () => {
      let t = track(fresh(), snap(T0, [proc(1, 'a.exe', 1000)]));
      t = track(t, snap(T0 + 1000, [proc(1, 'a.exe', 500)]));
      expect(cpuOf(t, 'a.exe')).toBe(0);
    });
  });

  describe('property', () => {
    it('どんな順に計測しても、合計は負にならず、各アプリの増えた分の合計を超えない', () => {
      const stepArb = fc.array(
        fc.record({ pid: fc.integer({ min: 1, max: 4 }), cpu: fc.nat({ max: 10_000 }) }),
        { maxLength: 6 },
      );
      fc.assert(
        fc.property(fc.array(stepArb, { minLength: 1, maxLength: 8 }), (steps) => {
          let t = fresh();
          const maxSeen = new Map<number, number>();
          steps.forEach((step, i) => {
            const unique = [...new Map(step.map((s) => [s.pid, s])).values()];
            for (const s of unique) maxSeen.set(s.pid, Math.max(maxSeen.get(s.pid) ?? 0, s.cpu));
            t = track(
              t,
              snap(
                T0 + i * 1000,
                unique.map((s) => proc(s.pid, `p${String(s.pid)}.exe`, s.cpu)),
              ),
            );
          });
          for (const usage of totals(t)) {
            expect(usage.cpuMs).toBeGreaterThanOrEqual(0);
            const pid = Number(usage.key.slice(1, -4));
            // 同じ PID は起動時刻も同じなので、増えた分の合計は見えた最大値を超えない（減った分は数えない）
            expect(usage.cpuMs).toBeLessThanOrEqual(steps.length * (maxSeen.get(pid) ?? 0));
          }
        }),
      );
    });
  });
});
