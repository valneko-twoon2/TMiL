#!/usr/bin/env node
// ミューテーションテスト（準備のみ。CI では回さない）。時間がかかるので手動で使う。
//   node scripts/test/mutation.mjs --backend    cargo-mutants（cargo install cargo-mutants が必要）
//   node scripts/test/mutation.mjs --frontend   Stryker（npx で一時的に取得する）
// 結果は reports/mutation/ に出る。
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { cargoMutantsArgs, strykerArgs } from '../lib/mutation.mjs';
import { BACKEND, combineStatus, FRONTEND, ROOT, run } from '../lib/proc.mjs';

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
  // 変異ごとのビルドを速くするため、ここだけ増分ビルドを使う（target は変異ごとの作業用の写しにできる）。
  // cargo-mutants は src/backend だけを写すので、テストが読む tests/ の場所を TMIL_REPO_ROOT で教える
  const cargoArgs = cargoMutantsArgs(output, availableParallelism());
  statuses.push(
    run('cargo', cargoArgs, { cwd: BACKEND, env: { CARGO_INCREMENTAL: '1', TMIL_REPO_ROOT: ROOT } }).status,
  );
}
if (frontend) {
  // npx は Windows だと .cmd になり直接起動できないので、npm 本体を node で動かす
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('npm run test:mutation -- --frontend から実行してください。');
    process.exit(1);
  }
  statuses.push(run(process.execPath, strykerArgs(npmCli), { cwd: FRONTEND }).status);
}
process.exit(combineStatus(statuses));
