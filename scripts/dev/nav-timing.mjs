#!/usr/bin/env node
// 画面の切り替えにかかる時間を測る（モック版で、プロセスを実機に近い数にして）。
//   node scripts/dev/nav-timing.mjs [--scale 10] [--rounds 7] [--cpu 4] [--url http://localhost:4173]
// 先に src/frontend で `npm run build:mock && npx vite preview --mode mock` を動かしておく。
// サイドバーを押してから、次の画面が描かれるまで（クリック → 描画 → 次のフレーム）の中央値を出す。
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../src/frontend/package.json', import.meta.url));
/** @type {typeof import('@playwright/test')} */
const { chromium } = require('@playwright/test');

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const scale = Number(option('scale', '10'));
const rounds = Number(option('rounds', '7'));
const cpu = Number(option('cpu', '4'));
const url = option('url', 'http://localhost:4173');
const PAGES = [
  'パフォーマンス',
  'アプリの履歴',
  'スタートアップ アプリ',
  'ユーザー',
  '詳細',
  'サービス',
  'リソース モニター',
  '設定',
  'プロセス',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await page.goto(`${url}/?scale=${String(scale)}`);
await page.getByTestId('process-group').first().waitFor();
// 計測が何回か届いてから測る
await page.waitForTimeout(3000);

const times = new Map(PAGES.map((p) => [p, []]));
for (let r = 0; r < rounds; r += 1) {
  for (const name of PAGES) {
    const ms = await page.evaluate(async (label) => {
      const nav = document.querySelector('nav');
      const button = [...(nav?.querySelectorAll('button') ?? [])].find(
        (b) => b.getAttribute('title') === label || b.textContent?.trim() === label,
      );
      if (!button) throw new Error(`見つかりません: ${label}`);
      const start = performance.now();
      button.click();
      // 描画が済んだ次のフレームまで
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      return performance.now() - start;
    }, name);
    times.get(name)?.push(ms);
    await page.waitForTimeout(300);
  }
}
await browser.close();

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
console.log(`プロセス ${String(scale)} 倍・CPU ${String(cpu)} 倍遅く・${String(rounds)} 回の中央値`);
let total = 0;
for (const [name, list] of times) {
  const m = median(list);
  total += m;
  console.log(`${name.padEnd(12, '　')} ${m.toFixed(1).padStart(7)} ms`);
}
console.log(`${'合計'.padEnd(12, '　')} ${total.toFixed(1).padStart(7)} ms`);
