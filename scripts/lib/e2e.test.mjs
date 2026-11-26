import { describe, expect, it } from 'vitest';
import { nativeTestArgs } from './e2e.mjs';

describe('nativeTestArgs', () => {
  describe('equivalence', () => {
    it('node:test で実アプリの E2E を回す', () => {
      expect(nativeTestArgs().slice(0, 2)).toEqual(['--test', '--test-reporter=spec']);
    });
  });

  describe('regression', () => {
    // フォルダーを渡していたため「Cannot find module」で 1 件も実行されずに失敗していた
    it('フォルダーではなくファイルのパターンを渡す', () => {
      expect(nativeTestArgs().at(-1)).toBe('tests/e2e/native/*.test.mjs');
    });
  });
});
