// 実アプリの E2E の起動方法（純粋関数）。

/** node --test に渡す引数。フォルダーは受け付けないので、ファイルのパターンで渡す。 */
export function nativeTestArgs() {
  return ['--test', '--test-reporter=spec', 'tests/e2e/native/*.test.mjs'];
}
