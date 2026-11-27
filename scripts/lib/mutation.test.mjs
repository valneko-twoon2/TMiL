import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { cargoMutantsArgs, strykerArgs } from './mutation.mjs';

describe('cargoMutantsArgs', () => {
  describe('equivalence', () => {
    it('CPU 4 つにつき 1 つずつ並べる', () => {
      const dir = mkdtempSync(join(tmpdir(), 'tmil-mutation-'));
      try {
        const args = cargoMutantsArgs(join(dir, 'out'), 16);
        assert.deepEqual(args.slice(args.indexOf('--jobs'), args.indexOf('--jobs') + 2), ['--jobs', '4']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('boundary', () => {
    it('CPU が少なくても 1 つは回す', () => {
      const dir = mkdtempSync(join(tmpdir(), 'tmil-mutation-'));
      try {
        assert.ok(cargoMutantsArgs(join(dir, 'out'), 1).includes('1'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('regression', () => {
    // npm の -p は --parseable の短縮で、パッケージ名が Stryker のコマンドとして渡り、始まらなかった
    it('Stryker のパッケージは --package= で渡す', () => {
      const args = strykerArgs('npm-cli.js');
      assert.ok(!args.includes('-p'));
      assert.equal(args.filter((a) => a.startsWith('--package=@stryker-mutator/')).length, 2);
      assert.deepEqual(args.slice(-3), ['--', 'stryker', 'run']);
    });

    // 結果を置くフォルダーの親（reports/mutation）が無いと、cargo-mutants が始まる前に失敗していた
    it('結果を置くフォルダーを親ごと作る', () => {
      const dir = mkdtempSync(join(tmpdir(), 'tmil-mutation-'));
      try {
        const output = join(dir, 'reports', 'mutation', 'backend');
        cargoMutantsArgs(output, 4);
        assert.ok(existsSync(output));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
