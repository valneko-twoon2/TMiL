// ファイルの種類を判定する共通ヘルパー。Lint と関連テストの選択で使う。

const norm = (f) => f.replaceAll('\\', '/');

/** Prettier で整形する対象。 */
export const isPrettierTarget = (f) =>
  /\.(ts|js|mjs|cjs|svelte|json|css|html|md|ya?ml)$/.test(norm(f)) &&
  !norm(f).endsWith('package-lock.json') &&
  !norm(f).startsWith('docs/testing/03-inventory.md') &&
  !norm(f).startsWith('src/backend/app/gen/') &&
  !norm(f).includes('__snapshots__/');

/** ESLint で検査する対象。 */
export const isEslintTarget = (f) =>
  /\.(ts|js|mjs|cjs|svelte)$/.test(norm(f)) && !norm(f).includes('/fixtures/');

/** svelte-check（型検査）が必要になる対象。 */
export const isTypeCheckTarget = (f) =>
  /\.(ts|svelte)$/.test(norm(f)) || ['src/frontend/tsconfig.json', 'tests/tsconfig.json'].includes(norm(f));

/** Rust のソースや設定。 */
export const isRustTarget = (f) =>
  /\.rs$/.test(norm(f)) ||
  /(^|\/)Cargo\.toml$/.test(norm(f)) ||
  ['src/backend/clippy.toml', 'src/backend/rustfmt.toml', 'src/backend/Cargo.lock'].includes(norm(f));

/** フロントエンドのソース。 */
export const isFrontendSource = (f) => norm(f).startsWith('src/frontend/');

/** バックエンドのソース。 */
export const isBackendSource = (f) => norm(f).startsWith('src/backend/');

/** テキストとして扱うファイル（改行コードの検査対象）。 */
export const isTextFile = (f) =>
  !/\.(png|ico|icns|jpe?g|gif|webp|woff2?|ttf|exe|dll|so|dylib|zip|gz)$/i.test(norm(f));

export { norm as normalizePath };

/** ESLint の設定（リポジトリ直下から見た場所）。パターンも直下を基準に書いてある。 */
export const ESLINT_CONFIG = 'src/frontend/eslint.config.js';

/**
 * ESLint の引数。リポジトリ直下で実行する。
 * ignore 対象のファイルを渡しても警告で失敗しないようにする。
 * @param {string[]} files リポジトリ直下からの相対パス。空なら全体
 * @param {boolean} fix
 */
export function eslintArgs(files, fix) {
  return [
    '-c',
    ESLINT_CONFIG,
    '--max-warnings',
    '0',
    '--no-warn-ignored',
    ...(fix ? ['--fix'] : []),
    ...(files.length > 0 ? files : ['.']),
  ];
}

/**
 * Prettier の引数。プラグインは実行した場所から探されるので、src/frontend で実行する。
 * そのため、ファイルと ignore ファイルは src/frontend から見た場所で渡す。
 * @param {string[]} files リポジトリ直下からの相対パス。空なら全体
 * @param {boolean} write true なら書き換え、false なら確認だけ
 */
export function prettierArgs(files, write) {
  const fromFrontend = (f) => `../../${norm(f)}`;
  return [
    write ? '--write' : '--check',
    '--log-level',
    'warn',
    '--ignore-path',
    '../../.prettierignore',
    '--ignore-path',
    '../../.gitignore',
    ...(files.length > 0 ? files.map(fromFrontend) : ['../..']),
  ];
}
