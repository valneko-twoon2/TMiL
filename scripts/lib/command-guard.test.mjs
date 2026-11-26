import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCommand } from './command-guard.mjs';

describe('checkCommand', () => {
  describe('equivalence', () => {
    for (const command of [
      'git commit --no-verify -m "x"',
      'git commit -n -m "x"',
      'git push --force origin develop',
      'git push -f',
      'git push origin main',
      'git config core.hooksPath other',
      'git config --unset core.hooksPath',
      'git commit -m "feat: 追加\n\nCo-Authored-By: someone"',
    ]) {
      it(`止める: ${command}`, () => {
        assert.notEqual(checkCommand(command), null);
      });
    }

    for (const command of [
      'git commit -m "feat: 追加"',
      'git push origin develop',
      'git config core.hooksPath',
      'git config core.hooksPath .githooks',
      'npm run lint',
      'grep -ri co-authored-by docs',
      'gh pr create --base main --head develop',
    ]) {
      it(`通す: ${command}`, () => {
        assert.equal(checkCommand(command), null);
      });
    }
  });

  describe('boundary', () => {
    it('空のコマンドは通す', () => {
      assert.equal(checkCommand(''), null);
    });

    it('別コマンドに続く main は push の対象とみなさない', () => {
      assert.equal(checkCommand('git push origin develop && echo main'), null);
    });

    it('-n が commit のオプションでなければ通す', () => {
      assert.equal(checkCommand('git log -n 5'), null);
    });
  });

  describe('regression', () => {
    // hooksPath を読むだけのコマンドでも && の & を値とみなして止めていた
    it('hooksPath を読むだけのコマンドに && が続いても通す', () => {
      assert.equal(checkCommand('git config --get core.hooksPath && git log'), null);
    });
  });
});
