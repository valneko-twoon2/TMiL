import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessIcon } from '../model/types';
import { ICON_REQUEST_LIMIT, unknownExes } from '../process/icons';
import { IconStore } from './icons.svelte';

function fakeApi(answer: (exes: string[]) => Promise<ProcessIcon[]>) {
  const processIcons = vi.fn(answer);
  return { api: { processIcons }, processIcons };
}

describe('unknownExes', () => {
  describe('equivalence', () => {
    it('知らない・問い合わせ中でないものだけを重複なしで返す', () => {
      const known = new Map([['a', null]]);
      const pending = new Set(['b']);
      expect(unknownExes(['a', 'b', 'c', 'c', 'd'], known, pending)).toEqual(['c', 'd']);
    });
  });

  describe('boundary', () => {
    it('空の場所は問い合わせない', () => {
      expect(unknownExes(['', '  '], new Map(), new Set())).toEqual([]);
    });

    it('上限を超えた分は次の機会に回す', () => {
      expect(unknownExes(['a', 'b', 'c'], new Map(), new Set(), 2)).toEqual(['a', 'b']);
    });
  });

  describe('contract', () => {
    it('上限はバックエンドの icons::MAX_PER_REQUEST と同じ', () => {
      const url = new URL('../../../backend/core/src/icons/mod.rs', import.meta.url);
      const limit = /pub const MAX_PER_REQUEST: usize = (\d+);/.exec(readFileSync(url, 'utf8'))?.[1];
      expect(Number(limit)).toBe(ICON_REQUEST_LIMIT);
    });
  });
});

describe('IconStore', () => {
  describe('equivalence', () => {
    it('問い合わせた結果を覚え、同じものは二度聞かない', async () => {
      const { api, processIcons } = fakeApi((exes) =>
        Promise.resolve(
          exes.map((exe) => ({
            exe,
            icon: exe === 'a' ? 'data:image/png;base64,AA==' : null,
            description: exe === 'a' ? 'アプリ A' : null,
            company: exe === 'a' ? '会社 A' : null,
          })),
        ),
      );
      const store = new IconStore(api);
      expect(store.get('a')).toBeUndefined();
      await store.request(['a', 'b']);
      expect(store.get('a')).toBe('data:image/png;base64,AA==');
      expect(store.get('b')).toBeNull();
      expect(store.description('a')).toBe('アプリ A');
      expect(store.company('a')).toBe('会社 A');
      expect(store.description('b')).toBe('');
      expect(store.description('unknown')).toBe('');
      await store.request(['a', 'b']);
      expect(processIcons).toHaveBeenCalledTimes(1);
    });

    it('問い合わせ中のものは重ねて聞かない', async () => {
      let resolve: (v: ProcessIcon[]) => void = () => undefined;
      const { api, processIcons } = fakeApi(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      const store = new IconStore(api);
      const first = store.request(['a']);
      await store.request(['a']);
      resolve([{ exe: 'a', icon: null, description: null, company: null }]);
      await first;
      expect(processIcons).toHaveBeenCalledTimes(1);
    });
  });

  describe('boundary', () => {
    it('失敗したら「無し」として覚え、繰り返さない', async () => {
      const { api, processIcons } = fakeApi(() => Promise.reject(new Error('x')));
      const store = new IconStore(api);
      await store.request(['a']);
      expect(store.get('a')).toBeNull();
      await store.request(['a']);
      expect(processIcons).toHaveBeenCalledTimes(1);
    });

    it('応答に無かったものも「無し」にする', async () => {
      const { api } = fakeApi(() => Promise.resolve([]));
      const store = new IconStore(api);
      await store.request(['a']);
      expect(store.get('a')).toBeNull();
    });

    it('知らないものが無ければ問い合わせない', async () => {
      const { api, processIcons } = fakeApi(() => Promise.resolve([]));
      await new IconStore(api).request(['']);
      expect(processIcons).not.toHaveBeenCalled();
    });
  });
});
