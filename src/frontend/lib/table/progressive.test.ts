import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { firstRows, growRows, ROW_HEIGHT_HINT, ROWS_PER_FRAME, takeRows } from './progressive';

describe('表を少しずつ描く', () => {
  describe('equivalence', () => {
    it('最初は画面の高さに収まるだけ描く', () => {
      expect(firstRows(960)).toBe(960 / ROW_HEIGHT_HINT);
      expect(firstRows(810)).toBe(Math.ceil(810 / ROW_HEIGHT_HINT));
    });

    it('フレームごとに決まった数ずつ足し、全部に届いたら止まる', () => {
      expect(growRows(40, 1000)).toBe(40 + ROWS_PER_FRAME);
      expect(growRows(990, 1000)).toBe(1000);
      expect(growRows(1000, 1000)).toBe(1000);
    });

    it('先頭から描く数だけ取る', () => {
      expect(takeRows([1, 2, 3], 2)).toEqual([1, 2]);
      const rows = [1, 2];
      expect(takeRows(rows, 5)).toBe(rows);
    });
  });

  describe('boundary', () => {
    it('高さが分からないとき（サーバーでの描画）は全部、0 や負でも 1 行は描く', () => {
      expect(firstRows(null)).toBe(Number.POSITIVE_INFINITY);
      expect(firstRows(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
      expect(firstRows(0)).toBe(1);
      expect(firstRows(-5)).toBe(1);
    });

    it('行が減ったときや足す数が 0 以下のとき', () => {
      expect(growRows(500, 10)).toBe(500);
      expect(growRows(0, 10, 0)).toBe(1);
      expect(takeRows([1, 2], 0)).toEqual([]);
      expect(takeRows([1, 2], -1)).toEqual([]);
      expect(takeRows([1], Number.POSITIVE_INFINITY)).toEqual([1]);
    });
  });

  describe('property', () => {
    it('足していくと、必ず全部の行に届き、行き過ぎない', () => {
      fc.assert(
        fc.property(fc.nat(5000), fc.nat(5000), fc.integer({ min: 1, max: 500 }), (start, total, step) => {
          let limit = start;
          for (let i = 0; i <= 5000 && limit < total; i += 1) limit = growRows(limit, total, step);
          expect(limit).toBe(Math.max(start, total));
        }),
      );
    });

    it('取った行は元の先頭と同じ並び', () => {
      fc.assert(
        fc.property(fc.array(fc.nat()), fc.nat(100), (rows, limit) => {
          const taken = takeRows(rows, limit);
          expect(taken).toEqual(rows.slice(0, limit));
        }),
      );
    });
  });
});
