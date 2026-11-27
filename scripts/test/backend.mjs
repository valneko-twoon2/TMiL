#!/usr/bin/env node
// バックエンド（taskmanagerlite-core）のテスト。
//   node scripts/test/backend.mjs              全部
//   node scripts/test/backend.mjs --coverage   カバレッジ付き（行 80% 未満で失敗）
//   node scripts/test/backend.mjs -- <filter>  名前で絞り込み（例: startup::desktop）
// Tauri 本体（taskmanagerlite クレート）は受け渡しだけなので、テストとカバレッジの対象外にしている。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BACKEND, ROOT, run } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');
const sep = args.indexOf('--');
const filter = sep === -1 ? [] : args.slice(sep + 1);
const cargo = (cargoArgs) => run('cargo', cargoArgs, { cwd: BACKEND });

// 結果はリポジトリ直下の coverage/ にまとめる（フロントと並べる）
const outDir = join(ROOT, 'coverage', 'backend');
if (coverage) mkdirSync(outDir, { recursive: true });

const result = coverage
  ? cargo([
      'llvm-cov',
      '-p',
      'taskmanagerlite-core',
      '--fail-under-lines',
      '80',
      '--lcov',
      '--output-path',
      join(outDir, 'lcov.info'),
      '--',
      ...filter,
    ])
  : cargo(['test', '-p', 'taskmanagerlite-core', '--', ...filter]);

if (coverage && result.status === 0) {
  cargo(['llvm-cov', 'report', '-p', 'taskmanagerlite-core', '--summary-only']);
}
process.exit(result.status);
