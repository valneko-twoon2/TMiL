#!/usr/bin/env node
// バックエンド（tmil-core）のテスト。
//   node scripts/test/backend.mjs              全部
//   node scripts/test/backend.mjs --coverage   カバレッジ付き（行 80% 未満で失敗）
//   node scripts/test/backend.mjs -- <filter>  名前で絞り込み（例: startup::desktop）
// Tauri 本体（tmil クレート）は受け渡しだけなので、テストとカバレッジの対象外にしている。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');
const sep = args.indexOf('--');
const filter = sep === -1 ? [] : args.slice(sep + 1);

if (coverage) mkdirSync(join(ROOT, 'coverage', 'backend'), { recursive: true });

const result = coverage
  ? run('cargo', [
      'llvm-cov',
      '-p',
      'tmil-core',
      '--fail-under-lines',
      '80',
      '--lcov',
      '--output-path',
      'coverage/backend/lcov.info',
      '--',
      ...filter,
    ])
  : run('cargo', ['test', '-p', 'tmil-core', '--', ...filter]);

if (coverage && result.status === 0) {
  run('cargo', ['llvm-cov', 'report', '-p', 'tmil-core', '--summary-only']);
}
process.exit(result.status);
