#!/usr/bin/env node
// ミューテーションテスト（準備のみ。CI では回さない）。時間がかかるので手動で使う。
//   node scripts/test/mutation.mjs --backend    cargo-mutants（cargo install cargo-mutants が必要）
//   node scripts/test/mutation.mjs --frontend   Stryker（npx で一時的に取得する）
// 結果は reports/mutation/ に出る。
import { join } from 'node:path';
import { BACKEND, combineStatus, FRONTEND, ROOT, run } from '../lib/proc.mjs';

const STRYKER_VERSION = '10';
const args = process.argv.slice(2);
const backend = args.includes('--backend');
const frontend = args.includes('--frontend');

if (!backend && !frontend) {
  console.log('使い方: node scripts/test/mutation.mjs --backend | --frontend');
  process.exit(0);
}

// 片方が失敗しても、もう片方は必ず回す
const statuses = [];
if (backend) {
  const output = join(ROOT, 'reports', 'mutation', 'backend');
  statuses.push(run('cargo', ['mutants', '-p', 'tmil-core', '--output', output], { cwd: BACKEND }).status);
}
if (frontend) {
  // npx は Windows だと .cmd になり直接起動できないので、npm 本体を node で動かす
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('npm run test:mutation -- --frontend から実行してください。');
    process.exit(1);
  }
  statuses.push(
    run(
      process.execPath,
      [
        npmCli,
        'exec',
        '--yes',
        '-p',
        `@stryker-mutator/core@${STRYKER_VERSION}`,
        '-p',
        `@stryker-mutator/vitest-runner@${STRYKER_VERSION}`,
        '--',
        'stryker',
        'run',
      ],
      { cwd: FRONTEND },
    ).status,
  );
}
process.exit(combineStatus(statuses));
