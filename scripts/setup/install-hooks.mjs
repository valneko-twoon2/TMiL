#!/usr/bin/env node
// git フックと改行コードの設定を入れる。npm install 時（prepare）に自動で走る。
import { capture, run } from '../lib/proc.mjs';

if (capture('git', ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') {
  // git 管理外（tarball 展開など）では何もしない
  process.exit(0);
}

const settings = [
  ['core.hooksPath', '.githooks'],
  ['core.autocrlf', 'false'],
  ['core.eol', 'lf'],
];
for (const [key, value] of settings) {
  run('git', ['config', key, value], { quiet: true });
}
console.log('git フックを有効にしました（core.hooksPath=.githooks）');
