#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): 編集したファイルを LF にそろえ、整形と Lint をかける。
// Lint で問題があれば exit 2 で Claude に返す。clippy と svelte-check はコミット時に回す。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { isEslintTarget, isPrettierTarget, isTextFile, normalizePath } from '../../lib/files.mjs';
import { ROOT, run, runNodeBin } from '../../lib/proc.mjs';
import { block, readHookInput } from './read-input.mjs';

const input = readHookInput();
const filePath = input.tool_input?.file_path;
if (typeof filePath !== 'string' || filePath === '') process.exit(0);

const abs = isAbsolute(filePath) ? filePath : join(ROOT, filePath);
const rel = normalizePath(relative(ROOT, abs));
if (rel.startsWith('..') || !existsSync(abs) || !isTextFile(rel)) process.exit(0);

// 改行コードを LF に統一
const text = readFileSync(abs, 'utf8');
if (text.includes('\r')) writeFileSync(abs, text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));

const hasNodeModules = existsSync(join(ROOT, 'node_modules'));
const problems = [];

if (hasNodeModules && isPrettierTarget(rel)) {
  runNodeBin('prettier', 'prettier', ['--write', '--log-level', 'warn', rel], { quiet: true });
}

if (hasNodeModules && isEslintTarget(rel)) {
  const r = runNodeBin('eslint', 'eslint', ['--max-warnings', '0', '--fix', rel], { quiet: true });
  if (r.status !== 0) problems.push(`[eslint]\n${r.stdout}${r.stderr}`.trim());
}

if (rel.endsWith('.rs')) {
  const r = run('rustfmt', ['--edition', '2024', rel], { quiet: true });
  if (r.status !== 0) problems.push(`[rustfmt]\n${r.stdout}${r.stderr}`.trim());
}

if (problems.length > 0) {
  block(`${rel} に Lint の指摘があります。直してください。\n\n${problems.join('\n\n')}`);
}
