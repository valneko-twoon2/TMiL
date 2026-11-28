import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ESLINT_CONFIG,
  eslintArgs,
  isEslintTarget,
  isPrettierTarget,
  isRustTarget,
  isTypeCheckTarget,
  prettierArgs,
} from './files.mjs';

describe('files', () => {
  describe('equivalence', () => {
    it('種類ごとに対象を判定する', () => {
      assert.equal(isEslintTarget('src/frontend/a.svelte'), true);
      assert.equal(isPrettierTarget('docs/a.md'), true);
      assert.equal(isRustTarget('src/backend/core/src/lib.rs'), true);
      assert.equal(isPrettierTarget('src/frontend/package-lock.json'), false);
    });

    it('設定ファイルはそれぞれの層の下にあるものを見る', () => {
      assert.equal(isTypeCheckTarget('src/frontend/tsconfig.json'), true);
      assert.equal(isTypeCheckTarget('tests/tsconfig.json'), true);
      assert.equal(isRustTarget('src/backend/Cargo.toml'), true);
      assert.equal(isRustTarget('src/backend/clippy.toml'), true);
      assert.equal(isRustTarget('src/backend/Cargo.lock'), true);
    });

    it('ESLint に設定・指定ファイル・自動修正を渡す', () => {
      assert.deepEqual(eslintArgs(['a.ts'], true), [
        '-c',
        ESLINT_CONFIG,
        '--max-warnings',
        '0',
        '--no-warn-ignored',
        '--fix',
        'a.ts',
      ]);
    });

    it('Prettier には src/frontend から見た場所とルートの ignore を渡す', () => {
      assert.deepEqual(prettierArgs(['docs/a.md'], false), [
        '--check',
        '--log-level',
        'warn',
        '--ignore-path',
        '../../.prettierignore',
        '--ignore-path',
        '../../.gitignore',
        '../../docs/a.md',
      ]);
      assert.equal(prettierArgs(['a.ts'], true)[0], '--write');
    });
  });

  describe('boundary', () => {
    it('ファイルが無ければ全体', () => {
      assert.equal(eslintArgs([], false).at(-1), '.');
      assert.equal(prettierArgs([], false).at(-1), '../..');
    });

    it('直下にあった頃の設定ファイル名は対象にしない', () => {
      assert.equal(isTypeCheckTarget('tsconfig.json'), false);
      assert.equal(isRustTarget('clippy.toml'), false);
    });

    it('Windows の区切り文字でも同じに扱う', () => {
      assert.equal(prettierArgs(['docs\\a.md'], false).at(-1), '../../docs/a.md');
    });
  });

  describe('regression', () => {
    // ESLint の対象外のファイルを編集すると「ignored」の警告で Claude のフックが止まっていた
    it('ignore 対象の警告を出さない', () => {
      assert.ok(eslintArgs(['test-results/x.cjs'], true).includes('--no-warn-ignored'));
    });
  });
});
