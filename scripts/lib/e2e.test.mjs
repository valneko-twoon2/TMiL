import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nativeTestArgs } from './e2e.mjs';

describe('nativeTestArgs', () => {
  describe('equivalence', () => {
    it('node:test で実アプリの E2E を回す', () => {
      assert.deepEqual(nativeTestArgs().slice(0, 2), ['--test', '--test-reporter=spec']);
    });
  });

  describe('regression', () => {
    // フォルダーを渡していたため「Cannot find module」で 1 件も実行されずに失敗していた
    it('フォルダーではなくファイルのパターンを渡す', () => {
      assert.equal(nativeTestArgs().at(-1), 'tests/e2e/native/*.test.mjs');
    });
  });
});
