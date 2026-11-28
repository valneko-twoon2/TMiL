// 子プロセス実行の共通ヘルパー。Windows / Linux の両方で shell を使わずに動かす。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** フロント（npm のパッケージ）。package.json と node_modules はここにある。 */
export const FRONTEND = join(ROOT, 'src', 'frontend');
/** バック（Cargo のワークスペース）。Cargo.toml と target/ はここにある。 */
export const BACKEND = join(ROOT, 'src', 'backend');

/** @type {Map<string, NodeJS.ProcessEnv>} */
const envCache = new Map();

/**
 * 環境変数の PATH の先頭にフォルダーを足した新しい環境変数を返す。
 * Windows では PATH のキーが `Path` のこともあるので、大文字小文字を無視して探す。
 * @param {NodeJS.ProcessEnv} env
 * @param {string} dir
 * @param {string} [sep]
 */
export function prependPath(env, dir, sep = delimiter) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const current = env[key];
  return { ...env, [key]: current ? `${dir}${sep}${current}` : dir };
}

/**
 * rustup のプロキシ（シンボリックリンク）を経由せずに cargo を呼べるよう、
 * ツールチェーンの bin を PATH の先頭に足した環境変数を返す。
 * プロキシを通らないので `cargo +nightly` の書き方は使えない。toolchain で指定する。
 * @param {string} [toolchain] 省略時は既定のツールチェーン
 */
export function toolEnv(toolchain) {
  const cacheKey = toolchain ?? '';
  const cached = envCache.get(cacheKey);
  if (cached) return cached;
  const args = toolchain ? ['which', '--toolchain', toolchain, 'cargo'] : ['which', 'cargo'];
  const which = spawnSync('rustup', args, { encoding: 'utf8', cwd: BACKEND });
  const env =
    which.status === 0 ? prependPath(process.env, dirname(which.stdout.trim())) : { ...process.env };
  envCache.set(cacheKey, env);
  return env;
}

/**
 * コマンドを実行して終了コードを返す。
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ quiet?: boolean, cwd?: string, env?: Record<string, string>, toolchain?: string }} [opts]
 */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: { ...toolEnv(opts.toolchain), ...opts.env },
    stdio: opts.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) {
    console.error(`[run] ${cmd} を起動できません: ${result.error.message}`);
    return { status: 1, stdout: '', stderr: String(result.error) };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** 出力を取得する用途の実行。失敗時は空文字。 */
export function capture(cmd, args, opts = {}) {
  const result = run(cmd, args, { ...opts, quiet: true });
  return result.status === 0 ? result.stdout : '';
}

/**
 * src/frontend/node_modules にある CLI を node で直接起動する（.cmd を経由しない）。
 * @param {string} pkg パッケージ名
 * @param {string} [binName] bin 名（省略時はパッケージ名）
 */
export function nodeBin(pkg, binName) {
  const pkgDir = join(FRONTEND, 'node_modules', pkg);
  const manifestPath = join(pkgDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${pkg} が見つかりません。src/frontend で npm install を実行してください。`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName ?? pkg];
  if (!bin) throw new Error(`${pkg} に bin ${binName ?? pkg} がありません。`);
  return join(pkgDir, bin);
}

/** node_modules の CLI を実行する。 */
export function runNodeBin(pkg, binName, args, opts = {}) {
  return run(process.execPath, [nodeBin(pkg, binName), ...args], opts);
}

/**
 * 複数の終了コードをまとめる（どれかが失敗なら最初の失敗を返す）。
 * @param {number[]} statuses
 */
export function combineStatus(statuses) {
  return statuses.find((s) => s !== 0) ?? 0;
}
