// 子プロセス実行の共通ヘルパー。Windows / Linux の両方で shell を使わずに動かす。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedEnv;

/**
 * rustup のプロキシ（シンボリックリンク）を経由せずに cargo を呼べるよう、
 * ツールチェーンの bin を PATH の先頭に足した環境変数を返す。
 */
export function toolEnv() {
  if (cachedEnv) return cachedEnv;
  const env = { ...process.env };
  const which = spawnSync('rustup', ['which', 'cargo'], { encoding: 'utf8', cwd: ROOT });
  if (which.status === 0) {
    const bin = dirname(which.stdout.trim());
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    env[key] = `${bin}${delimiter}${env[key] ?? ''}`;
  }
  cachedEnv = env;
  return env;
}

/**
 * コマンドを実行して終了コードを返す。
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ quiet?: boolean, cwd?: string, env?: Record<string, string> }} [opts]
 */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: { ...toolEnv(), ...opts.env },
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
 * node_modules にある CLI を node で直接起動する（.cmd を経由しない）。
 * @param {string} pkg パッケージ名
 * @param {string} [binName] bin 名（省略時はパッケージ名）
 */
export function nodeBin(pkg, binName) {
  const pkgDir = join(ROOT, 'node_modules', pkg);
  const manifestPath = join(pkgDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${pkg} が見つかりません。npm install を実行してください。`);
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
