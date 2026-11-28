import { describe, expect, it } from 'vitest';
import { areaPoints, linePoints, niceMax } from './chart';

describe('niceMax', () => {
  describe('equivalence', () => {
    it.each([
      [[3], 5],
      [[12], 20],
      [[150], 200],
      [[700], 1000],
    ])('%j → %d', (values, expected) => {
      expect(niceMax(values)).toBe(expected);
    });
  });

  describe('boundary', () => {
    it('空や 0 だけなら最低値', () => {
      expect(niceMax([])).toBe(1);
      expect(niceMax([0], 1024)).toBe(2000);
    });

    it('切りのよい数ちょうどはそのまま', () => {
      expect(niceMax([10])).toBe(10);
      expect(niceMax([20])).toBe(20);
      expect(niceMax([50])).toBe(50);
    });

    it('NaN は無視する', () => {
      expect(niceMax([Number.NaN, 4])).toBe(5);
    });
  });
});

describe('linePoints', () => {
  describe('equivalence', () => {
    it('右詰めで座標にする', () => {
      expect(linePoints([0, 50, 100], 100, 100, 50, 3)).toBe('0,50 50,25 100,0');
    });

    it('容量より少ないときは右端に寄せる', () => {
      expect(linePoints([100], 100, 100, 50, 3)).toBe('100,0');
    });

    it('塗りつぶし用の多角形を作る', () => {
      expect(areaPoints('0,50 50,25 100,0', 100, 50)).toBe('0,50 0,50 50,25 100,0 100,50');
    });
  });

  describe('boundary', () => {
    it('空・容量 1 以下・上限 0 以下なら空文字', () => {
      expect(linePoints([], 100, 100, 50, 3)).toBe('');
      expect(linePoints([1], 100, 100, 50, 1)).toBe('');
      expect(linePoints([1], 0, 100, 50, 3)).toBe('');
      expect(areaPoints('', 100, 50)).toBe('');
    });

    it('範囲外の値は 0〜上限に収める', () => {
      expect(linePoints([-10, 200, Number.NaN], 100, 100, 50, 3)).toBe('0,50 50,0 100,50');
    });

    it('容量を超える値は新しい方だけ使う', () => {
      expect(linePoints([0, 0, 100, 100], 100, 100, 50, 2)).toBe('0,0 100,0');
    });
  });
});
