#!/usr/bin/env node
// git pre-commit フック: 改行コード（LF）とステージ済みファイルの Lint を強制する。
import { isTextFile } from '../../lib/files.mjs';
import { crlfInIndex, stagedFiles } from '../../lib/git.mjs';
import { ROOT, run } from '../../lib/proc.mjs';

const files = stagedFiles();
if (files.length === 0) process.exit(0);

const crlf = crlfInIndex(files.filter(isTextFile));
if (crlf.length > 0) {
  console.error('CRLF のファイルはコミットできません。LF に変換してください:');
  for (const f of crlf) console.error(`  - ${f}`);
  process.exit(1);
}

const lint = run(process.execPath, [`${ROOT}/scripts/lint/lint.mjs`, '--staged']);
if (lint.status !== 0) {
  console.error('\nLint を直してからコミットしてください（自動修正: npm run lint:fix）');
  process.exit(1);
}
