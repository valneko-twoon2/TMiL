#!/usr/bin/env node
// ロゴ（assets/logo.svg）から、アプリのアイコン一式（src/backend/app/icons）を作り直す。
//   node scripts/dev/icons.mjs
// Tauri の CLI はモバイル用やストア用も作るので、一時フォルダーに出してから、icons/ に今あるファイルだけを置き換える。
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKEND, ROOT, runNodeBin } from '../lib/proc.mjs';

const source = join(ROOT, 'assets', 'logo.svg');
const icons = join(BACKEND, 'app', 'icons');
const out = mkdtempSync(join(tmpdir(), 'taskmanagerlite-icons-'));

try {
  const { status } = runNodeBin('@tauri-apps/cli', 'tauri', ['icon', source, '-o', out]);
  if (status !== 0) process.exitCode = status;
  else for (const name of readdirSync(icons)) copyFileSync(join(out, name), join(icons, name));
} finally {
  rmSync(out, { recursive: true, force: true });
}
