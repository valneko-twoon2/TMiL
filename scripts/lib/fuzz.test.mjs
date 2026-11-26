import { describe, expect, it } from 'vitest';
import { fuzzArgs } from './fuzz.mjs';
import { prependPath } from './proc.mjs';

describe('fuzzArgs', () => {
  describe('equivalence', () => {
    it('ターゲットと時間を渡す', () => {
      expect(fuzzArgs('command_line', 30)).toEqual([
        'fuzz',
        'run',
        'command_line',
        '--fuzz-dir',
        'tests/fuzz',
        '--',
        '-max_total_time=30',
      ]);
    });
  });

  describe('regression', () => {
    // PATH でツールチェーンを直接選んでいるため、cargo +nightly が「no such command」になっていた
    it('+toolchain の書き方を使わない', () => {
      expect(fuzzArgs('x', 1).some((a) => a.startsWith('+'))).toBe(false);
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
