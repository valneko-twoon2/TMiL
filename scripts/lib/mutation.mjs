// ミューテーションテストの呼び出し方（cargo-mutants）。
import { mkdirSync } from 'node:fs';

/**
 * cargo-mutants の引数。結果を置くフォルダーは先に作っておく（無いと cargo-mutants が失敗する）。
 * @param {string} output 結果を置くフォルダー
 * @param {number} cpus 使える CPU の数（並べる数を決める）
 */
export function cargoMutantsArgs(output, cpus) {
  mkdirSync(output, { recursive: true });
  // 1 つの変異ごとにビルドとテストをするので、CPU 4 つにつき 1 つずつ並べて回す
  const jobs = Math.max(1, Math.floor(cpus / 4));
  return ['mutants', '-p', 'taskmanagerlite-core', '--jobs', String(jobs), '--output', output];
}

/** Stryker の版（npx で一時的に取得する）。 */
export const STRYKER_VERSION = '10';

/**
 * npm exec で Stryker を動かす引数。npm の `-p` は `--parseable` の短縮なので、パッケージは `--package=` で渡す。
 * @param {string} npmCli npm 本体（npm_execpath）
 */
export function strykerArgs(npmCli) {
  return [
    npmCli,
    'exec',
    '--yes',
    `--package=@stryker-mutator/core@${STRYKER_VERSION}`,
    `--package=@stryker-mutator/vitest-runner@${STRYKER_VERSION}`,
    '--',
    'stryker',
    'run',
  ];
}
