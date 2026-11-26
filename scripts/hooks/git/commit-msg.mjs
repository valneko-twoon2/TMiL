#!/usr/bin/env node
// git commit-msg フック: コミットメッセージの規約を強制する。
import { readFileSync } from 'node:fs';
import { validateCommitMessage } from '../../lib/commit-message.mjs';

const file = process.argv[2];
if (!file) {
  console.error('commit-msg: メッセージファイルが渡されていません');
  process.exit(1);
}

const errors = validateCommitMessage(readFileSync(file, 'utf8'));
if (errors.length > 0) {
  console.error('コミットメッセージが規約に合っていません:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n例: feat: プロセス一覧に検索を追加');
  process.exit(1);
}
