#!/usr/bin/env node
// テストの種類ごとの件数を集計して docs/testing/03-inventory.md を作る。
//   node scripts/docs/test-inventory.mjs           生成する
//   node scripts/docs/test-inventory.mjs --check   最新か確かめる（差があれば失敗）
// 種類はテスト名に含まれるタグ（describe / mod の名前）で決める。docs/testing/02-tags.md を参照。
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BACKEND, capture, FRONTEND, nodeBin, ROOT, run } from '../lib/proc.mjs';
import { propertiesInCfg } from '../lib/formal.mjs';
import { buildInventory, parseJunit, renderInventory } from '../lib/inventory.mjs';

const OUTPUT = join(ROOT, 'docs', 'testing', '03-inventory.md');
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

/** @type {import('../lib/inventory.mjs').TestCase[]} */
const cases = [];

// Vitest（フロント）: it.each を展開した件数を取るため実行結果を使う
const vitestOut = join(ROOT, 'reports', 'vitest-inventory.json');
mkdirSync(join(ROOT, 'reports'), { recursive: true });
run(process.execPath, [nodeBin('vitest', 'vitest'), 'run', '--reporter=json', `--outputFile=${vitestOut}`], {
  quiet: true,
  cwd: FRONTEND,
});
const vitest = JSON.parse(readFileSync(vitestOut, 'utf8'));
rmSync(vitestOut);
for (const file of vitest.testResults) {
  const path = rel(file.name);
  for (const a of file.assertionResults) {
    cases.push({ runner: 'vitest', file: path, path: [...a.ancestorTitles, a.title] });
  }
}

// scripts/ のテスト（node:test）: ループで作るテストも数えるため実行結果を使う
const junit = capture(process.execPath, ['--test', '--test-reporter=junit', 'scripts/**/*.test.mjs']);
for (const c of parseJunit(junit)) {
  cases.push({ runner: 'node-test', file: rel(c.file), path: c.path });
}

// Rust
const rustList = capture(
  'cargo',
  ['test', '-p', 'tmil-core', '--quiet', '--', '--list', '--format', 'terse'],
  {
    cwd: BACKEND,
  },
);
for (const line of rustList.split('\n')) {
  const m = /^(.+): test$/.exec(line.trim());
  if (!m?.[1]) continue;
  const segments = m[1].split('::');
  cases.push({
    runner: 'cargo',
    file: segments
      .slice(0, -1)
      .filter((s) => s !== 'tests')
      .join('::'),
    path: segments,
  });
}

// cargo-fuzz のターゲット
const fuzzDir = join(ROOT, 'tests', 'fuzz', 'fuzz_targets');
if (existsSync(fuzzDir)) {
  for (const f of readdirSync(fuzzDir).filter((n) => n.endsWith('.rs'))) {
    cases.push({ runner: 'cargo-fuzz', file: `tests/fuzz/fuzz_targets/${f}`, path: ['fuzz', f] });
  }
}

// TLA+（TLC で検査する性質。遷移表の一致は 1 件と数える）
const formalDir = join(ROOT, 'tests', 'formal');
if (existsSync(formalDir)) {
  for (const f of readdirSync(formalDir).filter((n) => n.endsWith('.cfg'))) {
    const names = propertiesInCfg(readFileSync(join(formalDir, f), 'utf8'));
    for (const name of names.length > 0 ? names : [f.replace(/\.cfg$/, '')]) {
      cases.push({ runner: 'tlc', file: `tests/formal/${f}`, path: [name] });
    }
  }
  // 不具合を戻した版で違反を見つける検査は、1 つの cfg を 1 件と数える
  const regressionDir = join(formalDir, 'regressions');
  if (existsSync(regressionDir)) {
    for (const f of readdirSync(regressionDir).filter((n) => n.endsWith('.cfg'))) {
      cases.push({ runner: 'tlc', file: 'tests/formal/regressions', path: [f] });
    }
  }
}

// Playwright（E2E モックと VRT）
// ファイルは src/frontend（設定の場所）から見た場所で出るので、リポジトリ直下からに直す
const pwList = capture(process.execPath, [nodeBin('@playwright/test', 'playwright'), 'test', '--list'], {
  cwd: FRONTEND,
});
for (const line of pwList.split('\n')) {
  const m = /^\s*\[([^\]]+)\] › (\S+?):\d+:\d+ › (.+)$/.exec(line);
  if (!m?.[1] || !m[2] || !m[3]) continue;
  cases.push({
    runner: 'playwright',
    project: m[1],
    file: rel(resolve(FRONTEND, m[2])),
    path: m[3].split(' › '),
  });
}

// 実アプリの E2E（node:test）は静的に数える
const nativeDir = join(ROOT, 'tests', 'e2e', 'native');
for (const f of readdirSync(nativeDir).filter((n) => n.endsWith('.test.mjs'))) {
  const text = readFileSync(join(nativeDir, f), 'utf8');
  for (const m of text.matchAll(/^\s*it\('([^']+)'/gm)) {
    cases.push({ runner: 'node-test', file: `tests/e2e/native/${f}`, path: [m[1] ?? ''] });
  }
}

const markdown = renderInventory(buildInventory(cases));
if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current !== markdown) {
    console.error('docs/testing/03-inventory.md が古いです。npm run docs:tests で更新してください。');
    process.exit(1);
  }
  console.log('docs/testing/03-inventory.md は最新です。');
} else {
  writeFileSync(OUTPUT, markdown);
  console.log(`更新しました: ${rel(OUTPUT)}（${String(cases.length)} 件）`);
}
