#!/usr/bin/env node
// 変更したファイルに関係するテストだけを回す（普段の開発用）。
//   node scripts/test/related.mjs              未コミットの変更が対象
//   node scripts/test/related.mjs --since develop   指定コミットからの変更が対象
//   --e2e-mock / --vrt / --e2e-native を付けると、その E2E も回す
// 全部回すのは CI（または npm test）に任せる。
import { changedFiles, filesChangedSince } from '../lib/git.mjs';
import { run, runNodeBin } from '../lib/proc.mjs';
import { planTests } from '../lib/related.mjs';

const args = process.argv.slice(2);
const sinceIndex = args.indexOf('--since');
const files = sinceIndex === -1 ? changedFiles() : filesChangedSince(args[sinceIndex + 1] ?? 'HEAD');

if (files.length === 0) {
  console.log('変更がありません。');
  process.exit(0);
}

const plan = planTests(files);
const failures = [];
const step = (name, status) => {
  console.log(`${status === 0 ? '✔' : '✖'} ${name}`);
  if (status !== 0) failures.push(name);
};

if (plan.frontend.length > 0) {
  step(
    'vitest related',
    runNodeBin('vitest', 'vitest', ['related', '--run', '--passWithNoTests', ...plan.frontend]).status,
  );
}
if (plan.contract) {
  step(
    '契約（フロント）',
    runNodeBin('vitest', 'vitest', ['run', 'src/frontend/lib/model/contract.test.ts']).status,
  );
}
for (const filter of plan.rustFilters) {
  const label = filter === '' ? 'cargo test（全体）' : `cargo test ${filter}`;
  step(label, run('cargo', ['test', '-p', 'tmil-core', '--quiet', '--', ...(filter ? [filter] : [])]).status);
}
if (args.includes('--e2e-mock')) {
  step('E2E（モック）', runNodeBin('@playwright/test', 'playwright', ['test', '--project=e2e-mock']).status);
}
if (args.includes('--vrt')) {
  step('VRT', runNodeBin('@playwright/test', 'playwright', ['test', '--project=vrt']).status);
}
if (args.includes('--e2e-native')) {
  step('E2E（実アプリ）', run(process.execPath, ['scripts/test/e2e-native.mjs']).status);
}

if (plan.uiChanged && !args.includes('--e2e-mock')) {
  console.log('ヒント: 画面を変えたので --e2e-mock も回すと安心です。');
}
if (plan.backendChanged && !args.includes('--e2e-native')) {
  console.log('ヒント: バックエンドの挙動を変えたなら --e2e-native も検討してください。');
}
if (plan.formalChanged) {
  console.log(
    'ヒント: 状態機械か TLA+ を変えたので、npm run test:formal（または CI の形式検証）で確かめてください。',
  );
}
if (failures.length > 0) {
  console.error(`\n失敗: ${failures.join(', ')}`);
  process.exit(1);
}
