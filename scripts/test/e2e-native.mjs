#!/usr/bin/env node
// 実アプリの E2E を動かす。
//   1. アプリをデバッグビルド（--skip-build で省略）
//   2. tauri-driver を起動
//   3. node --test で tests/e2e/native を実行
// 必要なもの: tauri-driver（cargo install tauri-driver --locked）
//   Linux: webkit2gtk-driver（画面が無い環境は xvfb-run で包む）
//   Windows: msedgedriver（NATIVE_DRIVER に場所を指定）
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT, run, runNodeBin, toolEnv } from '../lib/proc.mjs';

const skipBuild = process.argv.includes('--skip-build');
const exe = join(ROOT, 'target', 'debug', process.platform === 'win32' ? 'tmil.exe' : 'tmil');

if (!skipBuild) {
  const build = runNodeBin('@tauri-apps/cli', 'tauri', ['build', '--debug', '--no-bundle']);
  if (build.status !== 0) process.exit(build.status);
}
if (!existsSync(exe)) {
  console.error(`アプリが見つかりません: ${exe}`);
  process.exit(1);
}

const driverArgs = process.env.NATIVE_DRIVER ? ['--native-driver', process.env.NATIVE_DRIVER] : [];
const driver = spawn(process.env.TAURI_DRIVER ?? 'tauri-driver', driverArgs, {
  env: toolEnv(),
  stdio: ['ignore', 'inherit', 'inherit'],
});
driver.on('error', (e) => {
  console.error(`tauri-driver を起動できません: ${e.message}`);
  process.exit(1);
});

let status;
try {
  await sleep(2000);
  status = run(process.execPath, ['--test', '--test-reporter=spec', 'tests/e2e/native/'], {
    env: { TMIL_APP: exe },
  }).status;
} finally {
  driver.kill();
}
process.exit(status);
