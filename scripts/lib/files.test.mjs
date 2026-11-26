import { describe, expect, it } from 'vitest';
import { eslintArgs, isEslintTarget, isPrettierTarget, isRustTarget } from './files.mjs';

describe('files', () => {
  describe('equivalence', () => {
    it('種類ごとに対象を判定する', () => {
      expect(isEslintTarget('src/frontend/a.svelte')).toBe(true);
      expect(isPrettierTarget('docs/a.md')).toBe(true);
      expect(isRustTarget('src/backend/core/src/lib.rs')).toBe(true);
      expect(isPrettierTarget('package-lock.json')).toBe(false);
    });

    it('ESLint に指定ファイルと自動修正を渡す', () => {
      expect(eslintArgs(['a.ts'], true)).toEqual([
        '--max-warnings',
        '0',
        '--no-warn-ignored',
        '--fix',
        'a.ts',
      ]);
    });
  });

  describe('boundary', () => {
    it('ファイルが無ければ全体', () => {
      expect(eslintArgs([], false).at(-1)).toBe('.');
    });
  });

  describe('regression', () => {
    // ESLint の対象外のファイルを編集すると「ignored」の警告で Claude のフックが止まっていた
    it('ignore 対象の警告を出さない', () => {
      expect(eslintArgs(['test-results/x.cjs'], true)).toContain('--no-warn-ignored');
    });
  });
});
