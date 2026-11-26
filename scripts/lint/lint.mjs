#!/usr/bin/env node
// Lint をまとめて実行する。
//   node scripts/lint/lint.mjs               全体
//   node scripts/lint/lint.mjs --staged      ステージ済みのファイルだけ
//   node scripts/lint/lint.mjs --changed     未コミットのファイルだけ
//   node scripts/lint/lint.mjs --files a b   指定ファイルだけ
//   --fix を付けると自動修正する
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isEslintTarget,
  isPrettierTarget,
  isRustTarget,
  isTypeCheckTarget,
  normalizePath,
} from '../lib/files.mjs';
import { changedFiles, stagedFiles } from '../lib/git.mjs';
import { ROOT, run, runNodeBin } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const fix = args.includes('--fix');

/** @type {string[] | null} null は全体 */
let targets = null;
if (args.includes('--staged')) targets = stagedFiles();
else if (args.includes('--changed')) targets = changedFiles();
else if (args.includes('--files')) targets = args.slice(args.indexOf('--files') + 1).filter((a) => !a.startsWith('--'));

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

// Prettier
const prettierFiles = pick(isPrettierTarget);
if (all || prettierFiles.length > 0) {
  step('prettier', () =>
    runNodeBin('prettier', 'prettier', [fix ? '--write' : '--check', '--log-level', 'warn', ...(all ? ['.'] : prettierFiles)])
      .status,
  );
}

// ESLint
const eslintFiles = pick(isEslintTarget);
if (all || eslintFiles.length > 0) {
  step('eslint', () =>
    runNodeBin('eslint', 'eslint', ['--max-warnings', '0', ...(fix ? ['--fix'] : []), ...(all ? ['.'] : eslintFiles)])
      .status,
  );
}

// svelte-check（型検査はプロジェクト全体が単位）
if (all || pick(isTypeCheckTarget).length > 0) {
  step('svelte-check', () =>
    runNodeBin('svelte-check', 'svelte-check', [
      '--tsconfig',
      './tsconfig.json',
      '--fail-on-warnings',
      '--output',
      'human',
    ]).status,
  );
}

// Rust
if (all || pick(isRustTarget).length > 0) {
  step('rustfmt', () => run('cargo', ['fmt', '--all', ...(fix ? [] : ['--', '--check'])]).status);
  step('clippy', () =>
    run('cargo', [
      'clippy',
      '--workspace',
      '--all-targets',
      '--quiet',
      ...(fix ? ['--fix', '--allow-dirty', '--allow-staged'] : []),
      '--',
      '-D',
      'warnings',
    ]).status,
  );
}

if (failures.length > 0) {
  console.error(`\nLint で失敗: ${failures.join(', ')}`);
  process.exit(1);
}
