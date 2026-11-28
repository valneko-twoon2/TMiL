import { afterEach, vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import {
  allowsNativeMenu,
  indexForKey,
  isItem,
  itemLabel,
  menuPosition,
  nextIndex,
  SEPARATOR,
  type MenuEntry,
} from './menu';

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

describe('itemLabel / indexForKey', () => {
  const withKeys: MenuEntry[] = [
    { id: 'end', label: 'タスクの終了', key: 'E' },
    SEPARATOR,
    { id: 'tree', label: 'プロセス ツリーの終了', key: 't', disabled: true },
    { id: 'plain', label: 'なし' },
  ];

  describe('equivalence', () => {
    it('アクセス キーを名前の後ろに付ける', () => {
      expect(itemLabel({ id: 'x', label: 'タスクの終了', key: 'e' })).toBe('タスクの終了(E)');
      expect(itemLabel({ id: 'x', label: 'なし' })).toBe('なし');
    });

    it('大文字・小文字を区別せずに項目を探す', () => {
      expect(indexForKey(withKeys, 'e')).toBe(0);
      expect(indexForKey(withKeys, 'E')).toBe(0);
    });
  });

  describe('boundary', () => {
    it('使えない項目・無いキー・1 文字でないキーは -1', () => {
      expect(indexForKey(withKeys, 't')).toBe(-1);
      expect(indexForKey(withKeys, 'z')).toBe(-1);
      expect(indexForKey(withKeys, 'Enter')).toBe(-1);
    });
  });
});

describe('右クリックメニュー（細部）', () => {
  describe('boundary', () => {
    it('余白の分だけはみ出すときも反対側に開く', () => {
      // 597 + 200 + 余白 4 = 801 > 800
      expect(menuPosition(597, 100, size, view).left).toBe(397);
      expect(menuPosition(100, 497, size, view).top).toBe(397);
    });

    it('下に進むか上に進むかで、選ぶ項目が変わる', () => {
      const list: MenuEntry[] = [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ];
      expect(nextIndex(list, 0, 1)).toBe(1);
      expect(nextIndex(list, 0, -1)).toBe(2);
    });
  });
});

describe('標準のメニューを残す場所', () => {
  /** テスト環境には DOM が無いので、使う所だけを持った要素で代わりにする。 */
  class FakeElement {
    constructor(readonly field: FakeElement | null = null) {}
    closest(selector: string): FakeElement | null {
      return selector === 'input, textarea, [contenteditable="true"]' ? this.field : null;
    }
  }
  class FakeInput extends FakeElement {
    constructor(readonly type: string) {
      super();
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('equivalence', () => {
    it('文字を入力する欄では残し、それ以外では出さない', () => {
      vi.stubGlobal('Element', FakeElement);
      vi.stubGlobal('HTMLInputElement', FakeInput);
      for (const type of ['text', 'search', 'url', 'email', 'number', 'password']) {
        const input = new FakeInput(type);
        expect(allowsNativeMenu(new FakeElement(input) as unknown as EventTarget), type).toBe(true);
      }
      for (const type of ['checkbox', 'radio', 'range']) {
        const input = new FakeInput(type);
        expect(allowsNativeMenu(new FakeElement(input) as unknown as EventTarget), type).toBe(false);
      }
      const textarea = new FakeElement();
      expect(allowsNativeMenu(new FakeElement(textarea) as unknown as EventTarget)).toBe(true);
      expect(allowsNativeMenu(new FakeElement(null) as unknown as EventTarget)).toBe(false);
    });
  });

  describe('boundary', () => {
    it('要素でないものでは出さない', () => {
      vi.stubGlobal('Element', FakeElement);
      vi.stubGlobal('HTMLInputElement', FakeInput);
      expect(allowsNativeMenu({} as EventTarget)).toBe(false);
    });
  });
});
