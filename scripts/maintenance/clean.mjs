#!/usr/bin/env node
// ビルド成果物やキャッシュを消す。
//   node scripts/maintenance/clean.mjs          全部
//   node scripts/maintenance/clean.mjs --rust   Rust の target だけ
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/proc.mjs';

const rustOnly = process.argv.includes('--rust');
const targets = rustOnly
  ? ['src/backend/target', 'tests/fuzz/target']
  : [
      'src/backend/target',
      'tests/fuzz/target',
      'src/frontend/dist',
      'src/frontend/dist-mock',
      'coverage',
      'reports',
      'test-results',
      'playwright-report',
      'src/frontend/.stryker-tmp',
      'src/backend/app/gen',
    ];

for (const t of targets) {
  rmSync(join(ROOT, t), { recursive: true, force: true });
  console.log(`削除: ${t}`);
}
