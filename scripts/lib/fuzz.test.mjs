import { describe, expect, it } from 'vitest';
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
    it('ターゲット・ホスト・時間を渡す', () => {
      expect(fuzzArgs('command_line', 30, 'x86_64-unknown-linux-gnu')).toEqual([
        'fuzz',
        'run',
        'command_line',
        '--fuzz-dir',
        'tests/fuzz',
        '--target',
        'x86_64-unknown-linux-gnu',
        '--',
        '-max_total_time=30',
      ]);
    });

    it('rustc -vV からホストを取り出す', () => {
      expect(parseHostTriple(RUSTC_VV)).toBe('x86_64-unknown-linux-gnu');
    });
  });

  describe('boundary', () => {
    it('ホストが分からなければ --target を付けない', () => {
      expect(fuzzArgs('x', 1, null)).not.toContain('--target');
    });

    it('host 行が無い・空なら null', () => {
      expect(parseHostTriple('')).toBeNull();
      expect(parseHostTriple('host: \n')).toBeNull();
    });
  });

  describe('regression', () => {
    // PATH でツールチェーンを直接選んでいるため、cargo +nightly が「no such command」になっていた
    it('+toolchain の書き方を使わない', () => {
      expect(fuzzArgs('x', 1, null).some((a) => a.startsWith('+'))).toBe(false);
    });

    // 配布版の cargo-fuzz が musl を既定にし、sanitizer と静的 libc の組み合わせで失敗していた
    it('ホストのターゲットを明示する', () => {
      const args = fuzzArgs('x', 1, 'x86_64-unknown-linux-gnu');
      expect(args[args.indexOf('--target') + 1]).toBe('x86_64-unknown-linux-gnu');
    });
  });
});

describe('prependPath', () => {
  describe('equivalence', () => {
    it('PATH の先頭に足す', () => {
      expect(prependPath({ PATH: '/usr/bin' }, '/opt/bin', ':').PATH).toBe('/opt/bin:/usr/bin');
    });

    it('Windows の Path キーにも足す', () => {
      const env = prependPath({ Path: 'C:\\Windows' }, 'C:\\rust\\bin', ';');
      expect(env.Path).toBe('C:\\rust\\bin;C:\\Windows');
      expect(env.PATH).toBeUndefined();
    });
  });

  describe('boundary', () => {
    it('PATH が無ければ作る', () => {
      expect(prependPath({}, '/opt/bin', ':').PATH).toBe('/opt/bin');
    });

    it('元の環境変数は変えない', () => {
      const env = { PATH: '/usr/bin' };
      prependPath(env, '/opt/bin', ':');
      expect(env.PATH).toBe('/usr/bin');
    });
  });
});
