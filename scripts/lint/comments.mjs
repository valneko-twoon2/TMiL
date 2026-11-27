#!/usr/bin/env node
// 足したコメントに「なぜ:」「契約:」の印があるか確かめる。
//   node scripts/lint/comments.mjs --staged       ステージ済みの差分（pre-commit）
//   node scripts/lint/comments.mjs --base <ref>   <ref> からの差分（CI）
import { describeViolations, unmarkedComments } from '../lib/added-comments.mjs';
import { ROOT, run } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
if (args.includes('--base') && !base) process.exit(0);
if (!args.includes('--staged') && !base) {
  console.error('使い方: comments.mjs --staged | --base <ref>');
  process.exit(2);
}
if (base && /^0+$/.test(base)) process.exit(0);

const diffArgs = base ? ['diff', '-U0', `${base}...HEAD`] : ['diff', '--cached', '-U0'];
const result = run('git', diffArgs, { cwd: ROOT, quiet: true });
if (result.status !== 0) {
  console.error('差分を読めないので、コメントの検査を飛ばす');
  process.exit(0);
}
const messages = describeViolations(unmarkedComments(String(result.stdout)));
if (messages.length === 0) process.exit(0);
console.error(messages.join('\n'));
process.exit(1);
