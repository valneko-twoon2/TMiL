// fast-check でランダムな入力を大量に与え、落ちないことと性質が保たれることを確かめる。
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linePoints, niceMax } from './chart/chart';
import { formatBits, formatBytes, formatPercent, formatUptime } from './format/format';
import { heatLevel } from './format/heat';
import { pushValue } from './history/history';
import { isSnapshot } from './model/guards';
import type { ProcessInfo } from './model/types';
import { filterProcesses, groupProcesses, sortBy } from './process/process';
import { parseSettings, PAGES } from './settings/settings';

const anyNumber = fc.oneof(
  fc.double(),
  fc.integer(),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0),
);

const processArb: fc.Arbitrary<ProcessInfo> = fc.record({
  pid: fc.nat(),
  parentPid: fc.option(fc.nat(), { nil: null }),
  name: fc.string(),
  exe: fc.string(),
  command: fc.string(),
  state: fc.constantFrom('running', 'sleeping', 'stopped', 'zombie', 'other'),
  user: fc.string(),
  cpu: fc.double({ min: 0, max: 100, noNaN: true }),
  memory: fc.nat(),
  diskReadPerSec: fc.nat(),
  diskWrittenPerSec: fc.nat(),
  runTimeSecs: fc.nat(),
});

describe('ランダム入力', () => {
  describe('fuzz', () => {
    it('整形関数はどんな数値でも例外を出さず文字列を返す', () => {
      fc.assert(
        fc.property(anyNumber, (n) => {
          for (const text of [formatBytes(n), formatPercent(n), formatUptime(n), formatBits(n)]) {
            expect(typeof text).toBe('string');
            expect(text).not.toContain('NaN');
          }
        }),
      );
    });

    it('heatLevel は常に 0〜5', () => {
      fc.assert(
        fc.property(anyNumber, (n) => {
          const level = heatLevel(n);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(5);
        }),
      );
    });

    it('niceMax は最大値以上で最低値以上', () => {
      fc.assert(
        fc.property(fc.array(fc.double({ min: 0, max: 1e12, noNaN: true })), (values) => {
          const max = niceMax(values);
          expect(max).toBeGreaterThanOrEqual(Math.max(1, ...values));
        }),
      );
    });

    it('linePoints の点の数は min(値の数, 容量)', () => {
      fc.assert(
        fc.property(
          fc.array(anyNumber, { maxLength: 80 }),
          fc.integer({ min: 2, max: 120 }),
          (values, capacity) => {
            const text = linePoints(values, 100, 600, 240, capacity);
            const count = text === '' ? 0 : text.split(' ').length;
            expect(count).toBe(Math.min(values.length, capacity));
            expect(text).not.toContain('NaN');
          },
        ),
      );
    });

    it('pushValue は容量を超えない', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double()),
          anyNumber,
          fc.integer({ min: -5, max: 100 }),
          (values, v, capacity) => {
            expect(pushValue(values, v, capacity).length).toBeLessThanOrEqual(Math.max(0, capacity));
          },
        ),
      );
    });

    it('グループ化しても PID の数は変わらない', () => {
      fc.assert(
        fc.property(fc.array(processArb, { maxLength: 50 }), (list) => {
          const total = groupProcesses(list).reduce((sum, g) => sum + g.pids.length, 0);
          expect(total).toBe(list.length);
        }),
      );
    });

    it('検索結果は元の一覧の部分集合', () => {
      fc.assert(
        fc.property(fc.array(processArb, { maxLength: 30 }), fc.string(), (list, q) => {
          const result = filterProcesses(list, q);
          expect(result.every((p) => list.includes(p))).toBe(true);
        }),
      );
    });

    it('並べ替えは要素を失わない', () => {
      fc.assert(
        fc.property(fc.array(fc.oneof(fc.integer(), fc.string(), fc.constant(null))), (values) => {
          const rows = values.map((v) => ({ v }));
          const sorted = sortBy(rows, { key: 'v', direction: 'asc' }, (r) => r.v);
          expect(sorted).toHaveLength(rows.length);
          expect(new Set(sorted)).toEqual(new Set(rows));
        }),
      );
    });

    it('parseSettings はどんな文字列でも有効な設定を返す', () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.json()), (raw) => {
          const s = parseSettings(raw);
          expect(PAGES).toContain(s.startPage);
        }),
      );
    });

    it('検証関数は何を渡しても例外を出さない', () => {
      fc.assert(
        fc.property(fc.anything(), (v) => {
          expect(typeof isSnapshot(v)).toBe('boolean');
        }),
      );
    });
  });
});
