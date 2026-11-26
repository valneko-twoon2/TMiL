#!/usr/bin/env node
// Lint をまとめて実行する。
//   node scripts/lint/lint.mjs               全体
//   node scripts/lint/lint.mjs --staged      ステージ済みのファイルだけ
//   node scripts/lint/lint.mjs --changed     未コミットのファイルだけ
//   node scripts/lint/lint.mjs --files a b   指定ファイルだけ
//   --fix を付けると自動修正する
//   --frontend / --backend でどちらかだけにする（CI で並列に回す用）
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  eslintArgs,
  isEslintTarget,
  isPrettierTarget,
  isRustTarget,
  isTypeCheckTarget,
  normalizePath,
  prettierArgs,
} from '../lib/files.mjs';
import { changedFiles, stagedFiles } from '../lib/git.mjs';
import { BACKEND, FRONTEND, ROOT, run, runNodeBin } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const onlyFrontend = args.includes('--frontend');
const onlyBackend = args.includes('--backend');
const frontendOn = !onlyBackend;
const backendOn = !onlyFrontend;

/** @type {string[] | null} null は全体 */
let targets = null;
if (args.includes('--staged')) targets = stagedFiles();
else if (args.includes('--changed')) targets = changedFiles();
else if (args.includes('--files')) {
  targets = args.slice(args.indexOf('--files') + 1).filter((a) => !a.startsWith('--'));
}

if (targets) {
  targets = targets.map(normalizePath).filter((f) => existsSync(join(ROOT, f)));
}

const all = targets === null;
const pick = (pred) => (all ? [] : targets.filter(pred));
const failures = [];

function step(name, fn) {
  const started = Date.now();
  const status = fn();
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  if (status === 0) console.log(`✔ ${name} (${sec}s)`);
  else {
    console.log(`✖ ${name} (${sec}s)`);
    failures.push(name);
  }
}

// ESLint（--fix のあとに Prettier で整えるので先に回す）
const eslintFiles = pick(isEslintTarget);
if (frontendOn && (all || eslintFiles.length > 0)) {
  step('eslint', () => runNodeBin('eslint', 'eslint', eslintArgs(all ? [] : eslintFiles, fix)).status);
}

// Prettier
const prettierFiles = pick(isPrettierTarget);
if (frontendOn && (all || prettierFiles.length > 0)) {
  step(
    'prettier',
    () => runNodeBin('prettier', 'prettier', prettierArgs(prettierFiles, fix), { cwd: FRONTEND }).status,
  );
}

// 文書の置き方とリンク切れ（Markdown を変えたときと全体のとき）
if (frontendOn && (all || pick((f) => f.endsWith('.md')).length > 0)) {
  step('docs', () => run(process.execPath, ['scripts/docs/check-docs.mjs']).status);
}

// シェル スクリプト（インストール スクリプト）。shellcheck が無い環境では飛ばす（CI の Linux にはある）
const shellFiles = all ? ['src/installer/install.sh'] : pick((f) => f.endsWith('.sh'));
if (frontendOn && shellFiles.length > 0) {
  if (run('shellcheck', ['--version'], { quiet: true }).status === 0) {
    step('shellcheck', () => run('shellcheck', ['-s', 'sh', ...shellFiles]).status);
  } else {
    console.log('- shellcheck が無いので飛ばす');
  }
}

// svelte-check（型検査はプロジェクト全体が単位）
if (frontendOn && (all || pick(isTypeCheckTarget).length > 0)) {
  step(
    'svelte-check',
    () =>
      runNodeBin(
        'svelte-check',
        'svelte-check',
        ['--tsconfig', './tsconfig.json', '--fail-on-warnings', '--output', 'human'],
        { cwd: FRONTEND },
      ).status,
  );
  // tests/ の TypeScript は tests/tsconfig.json で別に検査する
  step(
    'tsc（tests）',
    () => runNodeBin('typescript', 'tsc', ['-p', '../../tests/tsconfig.json'], { cwd: FRONTEND }).status,
  );
}

// Rust
if (backendOn && (all || pick(isRustTarget).length > 0)) {
  step(
    'rustfmt',
    () => run('cargo', ['fmt', '--all', ...(fix ? [] : ['--', '--check'])], { cwd: BACKEND }).status,
  );
  step(
    'clippy',
    () =>
      run(
        'cargo',
        [
          'clippy',
          '--workspace',
          '--all-targets',
          '--quiet',
          ...(fix ? ['--fix', '--allow-dirty', '--allow-staged'] : []),
          '--',
          '-D',
          'warnings',
        ],
        { cwd: BACKEND },
      ).status,
  );
}

if (failures.length > 0) {
  console.error(`\nLint で失敗: ${failures.join(', ')}`);
  process.exit(1);
}
