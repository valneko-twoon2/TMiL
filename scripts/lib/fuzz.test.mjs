import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fuzzArgs, parseHostTriple } from './fuzz.mjs';
import { prependPath } from './proc.mjs';

const RUSTC_VV = `rustc 1.99.0-nightly (abc 2026-11-01)
binary: rustc
commit-hash: abc
host: x86_64-unknown-linux-gnu
release: 1.99.0-nightly
LLVM version: 21.1.0`;

describe('fuzzArgs', () => {
  describe('equivalence', () => {
    // ルートの Cargo.toml を src/backend に移したので、tests/fuzz で実行してそこを指す
    it('ターゲット・ホスト・時間を渡す', () => {
      assert.deepEqual(fuzzArgs('command_line', 30, 'x86_64-unknown-linux-gnu'), [
        'fuzz',
        'run',
        'command_line',
        '--fuzz-dir',
        '.',
        '--target',
        'x86_64-unknown-linux-gnu',
        '--',
        '-max_total_time=30',
      ]);
    });

    it('rustc -vV からホストを取り出す', () => {
      assert.equal(parseHostTriple(RUSTC_VV), 'x86_64-unknown-linux-gnu');
    });
  });

  describe('boundary', () => {
    it('ホストが分からなければ --target を付けない', () => {
      assert.ok(!fuzzArgs('x', 1, null).includes('--target'));
    });

    it('host 行が無い・空なら null', () => {
      assert.equal(parseHostTriple(''), null);
      assert.equal(parseHostTriple('host: \n'), null);
    });
  });

  describe('regression', () => {
    // PATH でツールチェーンを直接選んでいるため、cargo +nightly が「no such command」になっていた
    it('+toolchain の書き方を使わない', () => {
      assert.equal(
        fuzzArgs('x', 1, null).some((a) => a.startsWith('+')),
        false,
      );
    });

    // 配布版の cargo-fuzz が musl を既定にし、sanitizer と静的 libc の組み合わせで失敗していた
    it('ホストのターゲットを明示する', () => {
      const args = fuzzArgs('x', 1, 'x86_64-unknown-linux-gnu');
      assert.equal(args[args.indexOf('--target') + 1], 'x86_64-unknown-linux-gnu');
    });
  });
});

describe('prependPath', () => {
  describe('equivalence', () => {
    it('PATH の先頭に足す', () => {
      assert.equal(prependPath({ PATH: '/usr/bin' }, '/opt/bin', ':').PATH, '/opt/bin:/usr/bin');
    });

    it('Windows の Path キーにも足す', () => {
      const env = prependPath({ Path: 'C:\\Windows' }, 'C:\\rust\\bin', ';');
      assert.equal(env.Path, 'C:\\rust\\bin;C:\\Windows');
      assert.equal(env.PATH, undefined);
    });
  });

  describe('boundary', () => {
    it('PATH が無ければ作る', () => {
      assert.equal(prependPath({}, '/opt/bin', ':').PATH, '/opt/bin');
    });

    it('元の環境変数は変えない', () => {
      const env = { PATH: '/usr/bin' };
      prependPath(env, '/opt/bin', ':');
      assert.equal(env.PATH, '/usr/bin');
    });
  });
});
