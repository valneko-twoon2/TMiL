// scripts/ 自身のテストの回し方（純粋関数）。
// scripts/ は Node だけで動かすので、テストも npm の依存を使わず node:test で書く。

/** node --test に渡す引数（リポジトリ直下で実行する）。フォルダーは受け付けないので、ファイルのパターンで渡す。 */
export function toolTestArgs() {
  return ['--test', '--test-reporter=spec', 'scripts/**/*.test.mjs'];
}
