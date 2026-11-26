#!/usr/bin/env node
// CHANGELOG.md から指定バージョンの本文を標準出力に出す（リリースの本文に使う）。
//   node scripts/release/changelog-section.mjs 0.1.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractSection } from '../lib/changelog.mjs';
import { ROOT } from '../lib/proc.mjs';

const version = process.argv[2];
if (!version) {
  console.error('使い方: node scripts/release/changelog-section.mjs <バージョン>');
  process.exit(1);
}
const body = extractSection(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
if (body === null) {
  console.error(`CHANGELOG.md に ${version} の節がありません`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);
