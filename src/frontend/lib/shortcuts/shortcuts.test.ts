import { describe, expect, it } from 'vitest';
import { shortcutOf } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('ショートカット', () => {
  describe('equivalence', () => {
    it('F5 で更新、Ctrl+F と Ctrl+E で検索、Ctrl+N で新しいタスク', () => {
      expect(shortcutOf(key('F5'))).toBe('refresh');
      expect(shortcutOf(key('f', { ctrlKey: true }))).toBe('search');
      expect(shortcutOf(key('E', { ctrlKey: true }))).toBe('search');
      expect(shortcutOf(key('n', { metaKey: true }))).toBe('runTask');
    });

    it('ほかのキーは何もしない', () => {
      expect(shortcutOf(key('a'))).toBeNull();
      expect(shortcutOf(key('f'))).toBeNull();
      expect(shortcutOf(key('x', { ctrlKey: true }))).toBeNull();
    });
  });

  describe('boundary', () => {
    it('Alt や Shift と一緒のとき、Ctrl と一緒の F5 は受け持たない', () => {
      expect(shortcutOf(key('f', { ctrlKey: true, shiftKey: true }))).toBeNull();
      expect(shortcutOf(key('F5', { altKey: true }))).toBeNull();
      expect(shortcutOf(key('F5', { ctrlKey: true }))).toBeNull();
    });
  });
});
