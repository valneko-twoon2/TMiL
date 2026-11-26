import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toolTestArgs } from './tools.mjs';

describe('toolTestArgs', () => {
  describe('equivalence', () => {
    it('scripts/ のテストをパターンで渡す', () => {
      assert.deepEqual(toolTestArgs(), ['--test', '--test-reporter=spec', 'scripts/**/*.test.mjs']);
    });
  });

  describe('boundary', () => {
    // node --test はフォルダーを渡すと失敗する
    it('フォルダーではなくファイルのパターンを渡す', () => {
      assert.ok(toolTestArgs().at(-1)?.endsWith('.test.mjs'));
    });
  });
});
