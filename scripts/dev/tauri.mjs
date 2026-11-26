#!/usr/bin/env node
// Tauri の CLI を呼ぶ。設定（src/backend/app）とフロント（src/frontend）の場所を教えてから渡す。
//   node scripts/dev/tauri.mjs dev                        アプリを起動
//   node scripts/dev/tauri.mjs build                      インストーラーを作る
//   node scripts/dev/tauri.mjs build --debug --no-bundle  E2E 用のデバッグビルド
import { tauriEnv } from '../lib/tauri.mjs';
import { FRONTEND, runNodeBin } from '../lib/proc.mjs';

const result = runNodeBin('@tauri-apps/cli', 'tauri', process.argv.slice(2), {
  cwd: FRONTEND,
  env: tauriEnv(),
});
process.exit(result.status);
