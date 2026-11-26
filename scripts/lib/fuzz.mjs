// cargo-fuzz の呼び出し方（純粋関数）。

/** ファジングに使うツールチェーン（sanitizer のため nightly が必要）。 */
export const FUZZ_TOOLCHAIN = 'nightly';

/**
 * `rustc -vV` の出力からホストのターゲットを取り出す。
 * @param {string} versionOutput
 * @returns {string | null}
 */
export function parseHostTriple(versionOutput) {
  const line = versionOutput.split('\n').find((l) => l.startsWith('host: '));
  const triple = line?.slice('host: '.length).trim();
  return triple ? triple : null;
}

/**
 * 1 ターゲットを時間を区切って回す cargo の引数。
 * ツールチェーンは PATH で選ぶので `+nightly` は付けない。
 * cargo-fuzz は自身のビルド先（配布版は musl）を既定のターゲットにするので、ホストを明示する。
 * @param {string} target
 * @param {number} seconds
 * @param {string | null} hostTriple
 */
export function fuzzArgs(target, seconds, hostTriple) {
  return [
    'fuzz',
    'run',
    target,
    '--fuzz-dir',
    'tests/fuzz',
    ...(hostTriple ? ['--target', hostTriple] : []),
    '--',
    `-max_total_time=${String(seconds)}`,
  ];
}
