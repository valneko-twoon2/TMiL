// cargo-fuzz の呼び出し方（純粋関数）。

/** ファジングに使うツールチェーン（sanitizer のため nightly が必要）。 */
export const FUZZ_TOOLCHAIN = 'nightly';

/**
 * 1 ターゲットを時間を区切って回す cargo の引数。
 * ツールチェーンは PATH で選ぶので `+nightly` は付けない。
 * @param {string} target
 * @param {number} seconds
 */
export function fuzzArgs(target, seconds) {
  return ['fuzz', 'run', target, '--fuzz-dir', 'tests/fuzz', '--', `-max_total_time=${String(seconds)}`];
}
