import { describe, expect, it } from 'vitest';
import { allowsNativeMenu, isItem, menuPosition, nextIndex, SEPARATOR, type MenuEntry } from './menu';

const view = { width: 800, height: 600 };
const size = { width: 200, height: 100 };

const entries: MenuEntry[] = [
  { id: 'a', label: 'A' },
  SEPARATOR,
  { id: 'b', label: 'B', disabled: true },
  { id: 'c', label: 'C' },
];

describe('menuPosition', () => {
  describe('equivalence', () => {
    it('入るならマウスの位置に開く', () => {
      expect(menuPosition(100, 100, size, view)).toEqual({ left: 100, top: 100 });
    });

    it('右や下にはみ出すなら反対側に開く', () => {
      expect(menuPosition(700, 550, size, view)).toEqual({ left: 500, top: 450 });
    });
  });

  describe('boundary', () => {
    it('画面より大きいメニューでも左上の余白から出す', () => {
      expect(menuPosition(10, 10, { width: 900, height: 700 }, view)).toEqual({ left: 4, top: 4 });
    });

    it('ちょうど入る位置はそのまま', () => {
      expect(menuPosition(596, 496, size, view)).toEqual({ left: 596, top: 496 });
    });
  });
});

describe('nextIndex', () => {
  describe('equivalence', () => {
    it('区切りと使えない項目を飛ばす', () => {
      expect(nextIndex(entries, 0, 1)).toBe(3);
      expect(nextIndex(entries, 3, -1)).toBe(0);
    });

    it('端では反対側に回る', () => {
      expect(nextIndex(entries, 3, 1)).toBe(0);
      expect(nextIndex(entries, 0, -1)).toBe(3);
    });
  });

  describe('boundary', () => {
    it('何も選んでいない（-1）なら先頭から', () => {
      expect(nextIndex(entries, -1, 1)).toBe(0);
    });

    it('選べる項目が無ければ -1', () => {
      expect(nextIndex([SEPARATOR, { id: 'x', label: 'X', disabled: true }], 0, 1)).toBe(-1);
      expect(nextIndex([], 0, 1)).toBe(-1);
    });
  });
});

describe('isItem / allowsNativeMenu', () => {
  describe('equivalence', () => {
    it('区切りは項目ではない', () => {
      expect(isItem(SEPARATOR)).toBe(false);
      expect(isItem({ id: 'a', label: 'A' })).toBe(true);
    });
  });

  describe('boundary', () => {
    it('DOM の要素でなければ標準のメニューは出さない', () => {
      expect(allowsNativeMenu(null)).toBe(false);
      expect(allowsNativeMenu({} as EventTarget)).toBe(false);
    });
  });
});
