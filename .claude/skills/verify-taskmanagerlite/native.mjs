#!/usr/bin/env node
// 実アプリ（Windows の WebView2）を CDP で操作して証拠を残す補助スクリプト。
//   node .claude/skills/verify-taskmanagerlite/native.mjs doctor
//   node .claude/skills/verify-taskmanagerlite/native.mjs run <ページ名> [検索語]
// ページ名: プロセス パフォーマンス アプリの履歴 スタートアップ アプリ ユーザー 詳細 サービス リソース モニター 設定
// 証拠: test-results/verify/<時刻>-<ページ>.png と .txt（片付けでも消さない）
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const EXE = join(ROOT, 'src/backend/target/debug/taskmanagerlite.exe');
const PORT = Number(process.env.VERIFY_CDP_PORT ?? 9333);
const require = createRequire(join(ROOT, 'src/frontend/package.json'));

const running = () => {
  const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq taskmanagerlite.exe', '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
  });
  return out.split('\n').filter((l) => l.toLowerCase().includes('taskmanagerlite.exe'));
};

function doctor() {
  const problems = [];
  if (process.platform !== 'win32') {
    problems.push('Windows 専用です（Linux は npm run test:e2e:native）');
  }
  if (!existsSync(EXE)) {
    problems.push('デバッグビルドが無い。src/frontend で npm run tauri -- build --debug --no-bundle');
  }
  if (running().length > 0) {
    problems.push(
      'TaskManagerLite がすでに動いている（単一起動なので二重に動かせない）。使っている人のものを終了させない',
    );
  }
  for (const p of problems) console.error(`NG: ${p}`);
  if (problems.length === 0) console.log('OK: 起動できる状態');
  return problems.length === 0;
}

async function run(page, query) {
  if (!doctor()) process.exit(1);
  const { chromium } = require('playwright-core');
  const profile = mkdtempSync(join(tmpdir(), 'tml-verify-'));
  const app = spawn(EXE, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  const outDir = join(ROOT, 'test-results/verify');
  mkdirSync(outDir, { recursive: true });
  let browser;
  try {
    for (let i = 0; i < 60 && !browser; i++) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
      if (!browser) await new Promise((r) => setTimeout(r, 500));
    }
    if (!browser) throw new Error('CDP に接続できない（アプリが起動しなかった）');
    const tab = browser.contexts()[0].pages()[0];
    if (tab.url().startsWith('chrome-error:')) {
      throw new Error(
        '開発サーバーを見に行く古いビルド。npm run tauri -- build --debug --no-bundle で作り直す',
      );
    }
    await tab.waitForSelector('nav button', { timeout: 20000 });
    await tab.locator(`nav button[title="${page}"]`).click();
    if (query) {
      const search = tab.locator('input[type="search"]').first();
      await search.fill(query);
    }
    await tab.waitForTimeout(3000); // 計測が数回届くのを待つ
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(outDir, `${stamp}-${page.replace(/\s+/g, '_')}`);
    await tab.screenshot({ path: `${base}.png` });
    const text = await tab
      .locator('main')
      .innerText()
      .catch(() => tab.locator('body').innerText());
    writeFileSync(`${base}.txt`, text);
    console.log(`証拠: ${base}.png / .txt`);
    console.log(text.split('\n').slice(0, 15).join('\n'));
  } finally {
    await browser?.close().catch(() => undefined);
    app.kill(); // 自分で起動した pid だけ止める
    await new Promise((r) => setTimeout(r, 1000));
    rmSync(profile, { recursive: true, force: true });
  }
}

const [cmd, page, query] = process.argv.slice(2);
if (cmd === 'doctor') process.exit(doctor() ? 0 : 1);
else if (cmd === 'run' && page) {
  await run(page, query);
} else {
  console.error('使い方: native.mjs doctor | run <ページ名> [検索語]');
  process.exit(2);
}
