import { describe, expect, it } from 'vitest';
import { checkCommand } from './command-guard.mjs';

describe('checkCommand', () => {
  describe('equivalence', () => {
    it.each([
      'git commit --no-verify -m "x"',
      'git commit -n -m "x"',
      'git push --force origin develop',
      'git push -f',
      'git push origin main',
      'git config core.hooksPath other',
      'git config --unset core.hooksPath',
      'git commit -m "feat: 追加\n\nCo-Authored-By: someone"',
    ])('止める: %s', (command) => {
      expect(checkCommand(command)).not.toBeNull();
    });

    it.each([
      'git commit -m "feat: 追加"',
      'git push origin develop',
      'git config core.hooksPath',
      'git config core.hooksPath .githooks',
      'npm run lint',
      'grep -ri co-authored-by docs',
      'gh pr create --base main --head develop',
    ])('通す: %s', (command) => {
      expect(checkCommand(command)).toBeNull();
    });
  });

  describe('boundary', () => {
    it('空のコマンドは通す', () => {
      expect(checkCommand('')).toBeNull();
    });

    it('別コマンドに続く main は push の対象とみなさない', () => {
      expect(checkCommand('git push origin develop && echo main')).toBeNull();
    });

    it('-n が commit のオプションでなければ通す', () => {
      expect(checkCommand('git log -n 5')).toBeNull();
    });
  });

  describe('regression', () => {
    // hooksPath を読むだけのコマンドでも && の & を値とみなして止めていた
    it('hooksPath を読むだけのコマンドに && が続いても通す', () => {
      expect(checkCommand('git config --get core.hooksPath && git log')).toBeNull();
    });
  });
});
