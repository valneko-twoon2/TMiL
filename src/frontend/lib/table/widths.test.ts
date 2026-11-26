import { describe, expect, it } from 'vitest';
import {
  clampWidth,
  DEFAULT_WIDTHS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseWidths,
  widthOf,
  withWidth,
} from './widths';

describe('列の幅', () => {
  describe('equivalence', () => {
    it('保存した幅があればそれ、無ければ最初の幅', () => {
      expect(widthOf({ 'details.pid': 99 }, 'details', 'pid')).toBe(99);
      expect(widthOf({}, 'details', 'pid')).toBe(DEFAULT_WIDTHS.details.pid);
    });

    it('幅を変えると、ほかの列はそのまま', () => {
      const next = withWidth({ 'details.pid': 99 }, 'startup', 'name', 250.4);
      expect(next).toEqual({ 'details.pid': 99, 'startup.name': 250 });
    });

    it('null なら最初の幅に戻す', () => {
      expect(withWidth({ 'details.pid': 99 }, 'details', 'pid', null)).toEqual({});
    });

    it('保存された値を読む', () => {
      expect(parseWidths({ 'details.pid': 80, 'processes.name': 5000 })).toEqual({
        'details.pid': 80,
        'processes.name': MAX_COLUMN_WIDTH,
      });
    });
  });

  describe('boundary', () => {
    it('狭すぎ・広すぎ・数でないものは範囲に収める', () => {
      expect(clampWidth(MIN_COLUMN_WIDTH - 1)).toBe(MIN_COLUMN_WIDTH);
      expect(clampWidth(MIN_COLUMN_WIDTH)).toBe(MIN_COLUMN_WIDTH);
      expect(clampWidth(MAX_COLUMN_WIDTH + 1)).toBe(MAX_COLUMN_WIDTH);
      expect(clampWidth(Number.NaN)).toBe(MIN_COLUMN_WIDTH);
    });

    it('知らない列は決まった幅', () => {
      expect(widthOf({}, 'details', 'unknown')).toBe(120);
    });

    it.each([null, 'x', 42, [1, 2]])('壊れた値 %j は空', (value) => {
      expect(parseWidths(value)).toEqual({});
    });

    it('キーの形や値の型が違うものは捨てる', () => {
      expect(parseWidths({ 'bad key': 10, 'details.pid': '80', 'a.b.c': 10, 'details.cpu': 60 })).toEqual({
        'details.cpu': 60,
      });
    });

    it('多すぎる値は上限で切る', () => {
      const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`t.c${String(i)}`, 50]));
      expect(Object.keys(parseWidths(many))).toHaveLength(100);
    });
  });
});
