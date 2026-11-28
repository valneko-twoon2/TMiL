#!/usr/bin/env node
// docs/ の置き方（番号付きのファイル名・各フォルダーの README）と、Markdown のリンク切れを確かめる。
//   node scripts/docs/check-docs.mjs
// Lint（scripts/lint/lint.mjs）からも呼ばれる。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brokenLinks, layoutProblems } from '../lib/docs.mjs';
import { capture, ROOT } from '../lib/proc.mjs';

const files = capture('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
  .split('\n')
  .filter((f) => f !== '' && existsSync(join(ROOT, f)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const markdown = files.filter((f) => f.endsWith('.md') && !f.includes('node_modules/'));

const problems = [
  ...layoutProblems(
    files.filter((f) => f.startsWith('docs/')),
    read,
  ),
  ...brokenLinks(markdown, read, (p) => existsSync(join(ROOT, p))),
];

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error('\n書き方は .claude/skills/docs/SKILL.md を見てください。');
  process.exit(1);
}
