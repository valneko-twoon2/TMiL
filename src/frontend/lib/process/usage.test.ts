import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { snapshotFixture } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import {
  growingProcesses,
  LEAK_MIN_BYTES,
  LEAK_MIN_SAMPLES,
  memoryGrowth,
  NO_USAGE,
  processKey,
  recentAverage,
  recordUsage,
  spanLabel,
  spanSeconds,
} from './usage';

const MB = 1024 ** 2;

function proc(pid: number, memory: number, cpu = 1): ProcessInfo {
  const base = snapshotFixture().processes[0];
  if (!base) throw new Error('fixture');
  return { ...base, pid, startTime: 1000 + pid, memory, cpu };
}

/** start から毎回 step ずつ増える推移。 */
const rising = (length: number, start: number, step: number) =>
  Array.from({ length }, (_, i) => start + i * step);

describe('プロセスごとの使用状況', () => {
  describe('equivalence', () => {
    it('計測ごとに CPU とメモリを足し、終了したプロセスは消す', () => {
      let samples = recordUsage(NO_USAGE, { processes: [proc(1, 100, 5), proc(2, 200)] });
      samples = recordUsage(samples, { processes: [proc(1, 110, 7)] });
      expect(samples.get(processKey(proc(1, 0)))).toEqual({ cpu: [5, 7], memory: [100, 110] });
      expect(samples.has(processKey(proc(2, 0)))).toBe(false);
    });

    it('同じ PID でも起動時刻が違えば別のプロセス', () => {
      const first = recordUsage(NO_USAGE, { processes: [proc(1, 100)] });
      const reused = { ...proc(1, 500), startTime: 9999 };
      const next = recordUsage(first, { processes: [reused] });
      expect(next.get(processKey(reused))).toEqual({ cpu: [1], memory: [500] });
    });

    it('ゆっくり増え続けるメモリは増加中、横ばいや減るものは違う', () => {
      expect(memoryGrowth(rising(120, 100 * MB, 2 * MB))).toBeGreaterThan(LEAK_MIN_BYTES);
      expect(memoryGrowth(rising(120, 100 * MB, 0))).toBeNull();
      expect(memoryGrowth(rising(120, 400 * MB, -2 * MB))).toBeNull();
    });

    it('一度だけ跳ね上がってそのままのものは増加中にしない', () => {
      const jump = [...rising(90, 100 * MB, 0), ...rising(30, 400 * MB, 0)];
      expect(memoryGrowth(jump)).toBeNull();
    });

    it('増えた量が少ないもの（大きなプロセスのわずかな増加）は増加中にしない', () => {
      // 2 GB から 1 割ほど（約 200 MB）増えても、はじめの 2 割には届かない
      expect(memoryGrowth(rising(120, 2048 * MB, 1.7 * MB))).toBeNull();
      // 10 MB から 30 MB でも、量が 50 MB に届かない
      expect(memoryGrowth(rising(120, 10 * MB, MB / 6))).toBeNull();
    });

    it('増加中のプロセスを鍵で返す', () => {
      let samples = NO_USAGE;
      for (let i = 0; i < 120; i += 1) {
        samples = recordUsage(samples, { processes: [proc(1, 100 * MB + i * 2 * MB), proc(2, 100 * MB)] });
      }
      const growing = growingProcesses(samples);
      expect([...growing.keys()]).toEqual([processKey(proc(1, 0))]);
    });

    it('推移の長さを秒か分で出す', () => {
      expect(spanSeconds(60, 1000)).toBe(59);
      expect(spanLabel(30)).toBe('30 秒');
      expect(spanLabel(299)).toBe('5 分');
    });
  });

  describe('boundary', () => {
    it('覚えておく数を超えたら古いものから捨てる', () => {
      let samples = NO_USAGE;
      for (let i = 0; i < 5; i += 1) samples = recordUsage(samples, { processes: [proc(1, i)] }, 3);
      expect(samples.get(processKey(proc(1, 0)))?.memory).toEqual([2, 3, 4]);
      expect(recordUsage(samples, { processes: [proc(1, 0)] }, 0).size).toBe(0);
    });

    it('計測の数が足りないうちは判断しない', () => {
      expect(memoryGrowth([])).toBeNull();
      expect(memoryGrowth(rising(LEAK_MIN_SAMPLES - 1, 0, 10 * MB))).toBeNull();
      expect(memoryGrowth(rising(LEAK_MIN_SAMPLES, 0, 10 * MB))).not.toBeNull();
    });

    it('直近の平均は、数が足りなければあるだけで、無ければ null', () => {
      expect(recentAverage([1, 2, 3, 6], 2)).toBe(4.5);
      expect(recentAverage([4], 10)).toBe(4);
      expect(recentAverage([])).toBeNull();
      expect(recentAverage([1, 2], 0)).toBeNull();
    });

    it('長さの表示は 0 と負の値と不正な値を 0 秒にする', () => {
      expect(spanSeconds(0, 1000)).toBe(0);
      expect(spanSeconds(10, -5)).toBe(0);
      expect(spanLabel(-1)).toBe('0 秒');
      expect(spanLabel(Number.NaN)).toBe('0 秒');
      expect(spanLabel(59.4)).toBe('59 秒');
      expect(spanLabel(60)).toBe('1 分');
    });
  });

  describe('property', () => {
    const series = fc.array(fc.integer({ min: 0, max: 4096 * MB }), { minLength: 0, maxLength: 200 });

    it('減らない推移を逆にすると、増加中にはならない', () => {
      fc.assert(
        fc.property(series, (values) => {
          const up = [...values].sort((a, b) => a - b);
          expect(memoryGrowth([...up].reverse())).toBeNull();
        }),
      );
    });

    it('横ばいは増加中にならない', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 4096 * MB }), fc.nat(300), (value, length) => {
          expect(memoryGrowth(Array.from({ length }, () => value))).toBeNull();
        }),
      );
    });

    it('増加中の推移を何倍かにしても増加中のまま', () => {
      fc.assert(
        fc.property(series, fc.double({ min: 1, max: 4, noNaN: true }), (values, scale) => {
          if (memoryGrowth(values) === null) return;
          expect(memoryGrowth(values.map((v) => v * scale))).not.toBeNull();
        }),
      );
    });

    it('覚えている数は上限を超えず、最後の値は最新の計測', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat(), { minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1, max: 20 }),
          (values, cap) => {
            let samples = NO_USAGE;
            for (const v of values) samples = recordUsage(samples, { processes: [proc(1, v)] }, cap);
            const memory = samples.get(processKey(proc(1, 0)))?.memory ?? [];
            expect(memory.length).toBe(Math.min(cap, values.length));
            expect(memory.at(-1)).toBe(values.at(-1));
          },
        ),
      );
    });
  });
});
