// 列の幅・メニューの位置・設定の読み込みに、どんな入力でも成り立つ性質があるかを fast-check で確かめる。
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isItem, menuPosition, nextIndex, type MenuEntry } from '../menu/menu';
import { parseSettings, SETTINGS_STORAGE_KEY } from '../settings/settings';
import {
  clampWidth,
  DEFAULT_WIDTHS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseWidths,
  widthOf,
  withWidth,
} from './widths';

const tableArb = fc.constantFrom(...Object.keys(DEFAULT_WIDTHS));
const anyNumber = fc.oneof(fc.double(), fc.integer(), fc.constantFrom(Number.NaN, Infinity, -Infinity));

describe('列の幅・メニュー・設定', () => {
  describe('property', () => {
    it('幅はどんな数でも範囲に収まり、収めたものをもう一度収めても変わらない', () => {
      fc.assert(
        fc.property(anyNumber, (n) => {
          const w = clampWidth(n);
          expect(w).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH);
          expect(w).toBeLessThanOrEqual(MAX_COLUMN_WIDTH);
          expect(clampWidth(w)).toBe(w);
        }),
      );
    });

    it('幅を変えたら、その列はその幅になり、ほかの列は変わらない', () => {
      fc.assert(
        fc.property(tableArb, fc.string({ minLength: 1 }), anyNumber, (table, column, width) => {
          const before = { 'details.pid': 99 };
          const after = withWidth(before, table, column, width);
          expect(widthOf(after, table, column)).toBe(clampWidth(width));
          if (`${table}.${column}` !== 'details.pid') expect(after['details.pid']).toBe(99);
        }),
      );
    });

    it('保存された幅は、どんな値を読んでも、読み直すと同じ結果になる', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const once = parseWidths(value);
          expect(parseWidths(once)).toEqual(once);
        }),
      );
    });

    it('メニューは画面に入る大きさなら、必ず画面の中に置かれる', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 2000 }),
          fc.integer({ min: -100, max: 2000 }),
          fc.integer({ min: 10, max: 400 }),
          fc.integer({ min: 10, max: 400 }),
          (x, y, width, height) => {
            const view = { width: 1000, height: 800 };
            const { left, top } = menuPosition(x, y, { width, height }, view);
            expect(left).toBeGreaterThanOrEqual(0);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(left + width).toBeLessThanOrEqual(view.width);
            expect(top + height).toBeLessThanOrEqual(view.height);
          },
        ),
      );
    });

    it('矢印キーの移動先は、選べる項目か、選べる項目が無いときだけ -1', () => {
      const entryArb: fc.Arbitrary<MenuEntry> = fc.oneof(
        fc.constant({ separator: true as const }),
        fc.record({ id: fc.string(), label: fc.string(), disabled: fc.boolean() }),
      );
      fc.assert(
        fc.property(
          fc.array(entryArb, { maxLength: 10 }),
          fc.integer({ min: -1, max: 10 }),
          fc.constantFrom<1 | -1>(1, -1),
          (entries, current, step) => {
            const next = nextIndex(entries, current, step);
            const selectable = entries.some((e) => isItem(e) && e.disabled !== true);
            if (!selectable) {
              expect(next).toBe(-1);
              return;
            }
            const entry = entries[next];
            expect(entry && isItem(entry) && entry.disabled !== true).toBe(true);
          },
        ),
      );
    });

    it('設定はどんな文字列を読んでも落ちず、保存して読み直すと同じになる', () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(null)), (raw) => {
          const settings = parseSettings(raw);
          expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
        }),
      );
      expect(SETTINGS_STORAGE_KEY).toBe('taskmanagerlite.settings');
    });
  });
});
