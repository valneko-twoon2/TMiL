import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { activeSort, cellText, defaultWidths, numericKeys, sortRows, type TableColumn } from './table';

interface Row {
  name: string;
  size: number | null;
}

const NAME: TableColumn<Row> = { key: 'name', label: '名前', width: 100, value: (r) => r.name };
const SIZE: TableColumn<Row> = {
  key: 'size',
  label: 'サイズ',
  numeric: true,
  value: (r) => r.size,
  text: (r) => `${String(r.size ?? 0)} B`,
};
const COLUMNS = [NAME, SIZE];

/** 並びに関係なく比べるための形。 */
const canonical = (rows: readonly Row[]) => rows.map((r) => `${r.name}|${String(r.size)}`).sort();

describe('共通の表', () => {
  describe('equivalence', () => {
    it('セルは text があればそれ、無ければ値', () => {
      expect(cellText(NAME, { name: 'a', size: 1 })).toBe('a');
      expect(cellText(SIZE, { name: 'a', size: 1 })).toBe('1 B');
    });

    it('数値の列と、幅の決まった列', () => {
      expect(numericKeys(COLUMNS)).toEqual(['size']);
      expect(defaultWidths(COLUMNS)).toEqual({ name: 100 });
    });

    it('列の値で並べ替える', () => {
      const rows = [
        { name: 'b', size: 2 },
        { name: 'a', size: 3 },
      ];
      expect(sortRows(rows, COLUMNS, { key: 'size', direction: 'desc' }).map((r) => r.name)).toEqual([
        'a',
        'b',
      ]);
      expect(sortRows(rows, COLUMNS, { key: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
        'a',
        'b',
      ]);
    });

    it('無くなった列で並べていたら、最初の列の昇順に戻す', () => {
      expect(activeSort(COLUMNS, { key: 'gone', direction: 'desc' })).toEqual({
        key: 'name',
        direction: 'asc',
      });
      expect(activeSort(COLUMNS, { key: 'size', direction: 'desc' })).toEqual({
        key: 'size',
        direction: 'desc',
      });
    });
  });

  describe('boundary', () => {
    it('null の値は空の文字、並べ替えでは最後', () => {
      const plain: TableColumn<Row> = { key: 'size', label: 's', value: (r) => r.size };
      expect(cellText(plain, { name: 'a', size: null })).toBe('');
      const rows = [
        { name: 'x', size: null },
        { name: 'y', size: 1 },
      ];
      expect(sortRows(rows, COLUMNS, { key: 'size', direction: 'asc' }).map((r) => r.name)).toEqual([
        'y',
        'x',
      ]);
    });

    it('知らない列なら元の順、列が無ければ並べ替えの鍵はそのまま', () => {
      const rows = [
        { name: 'b', size: 1 },
        { name: 'a', size: 2 },
      ];
      expect(sortRows(rows, COLUMNS, { key: 'nope', direction: 'asc' })).toEqual(rows);
      expect(activeSort([], { key: 'nope', direction: 'desc' })).toEqual({ key: 'nope', direction: 'asc' });
    });
  });

  describe('property', () => {
    it('並べ替えても行の数と中身は変わらない', () => {
      const rowArb = fc.record({ name: fc.string(), size: fc.option(fc.integer(), { nil: null }) });
      fc.assert(
        fc.property(
          fc.array(rowArb),
          fc.constantFrom('name', 'size'),
          fc.constantFrom('asc', 'desc'),
          (rows, key, direction) => {
            const sorted = sortRows(rows, COLUMNS, { key, direction });
            expect(sorted).toHaveLength(rows.length);
            expect(canonical(sorted)).toEqual(canonical(rows));
          },
        ),
      );
    });
  });
});
