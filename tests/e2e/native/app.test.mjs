// 実際に TMiL を起動して操作する E2E（tauri-driver + WebDriver）。
// バックエンドの変更を確かめたいときに使う。実行は scripts/test/e2e-native.mjs から。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, afterEach, before, describe, it } from 'node:test';

// selenium-webdriver は src/frontend の依存なので、そこを起点に読み込む（tests/ からは node_modules が見えない）
const require = createRequire(new URL('../../../src/frontend/package.json', import.meta.url));
/** @type {typeof import('selenium-webdriver')} */
const { Builder, By, Capabilities, until } = require('selenium-webdriver');

const application = process.env.TMIL_APP;
const server = process.env.TAURI_DRIVER_URL ?? 'http://127.0.0.1:4444/';
const TIMEOUT = 20_000;

/** @type {import('selenium-webdriver').WebDriver} */
let driver;

async function navigate(label) {
  const nav = await driver.findElement(By.css('nav'));
  await nav.findElement(By.css(`button[title="${label}"]`)).click();
}

before(async () => {
  assert.ok(application, 'TMIL_APP に起動するアプリのパスを指定してください');
  const capabilities = new Capabilities();
  capabilities.set('tauri:options', { application });
  capabilities.setBrowserName('wry');
  driver = await new Builder().withCapabilities(capabilities).usingServer(server).build();
});

// 失敗したときは、画面と DOM を test-results/native に残す（CI では成果物として置く）
afterEach(async (t) => {
  if (!driver || t.passed) return;
  await saveEvidence(t.name).catch(() => undefined);
});

after(async () => {
  await driver?.quit();
});

/** 画面と DOM を保存する。失敗の原因を後から見るため。 */
async function saveEvidence(name) {
  const dir = new URL('../../../test-results/native/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const safe = name.replace(/[^\w-]+/g, '_');
  writeFileSync(new URL(`${safe}.png`, dir), await driver.takeScreenshot(), 'base64');
  writeFileSync(new URL(`${safe}.html`, dir), await driver.getPageSource());
}

describe('実アプリ', () => {
  it('プロセス一覧に実際のプロセスが並ぶ', async () => {
    const rows = await driver.wait(until.elementsLocated(By.css('[data-testid="process-group"]')), TIMEOUT);
    assert.ok(rows.length > 1, 'プロセスが 2 つ以上あるはず');
    // getText は「見えている文字」だけを返し、列の幅に収めるため overflow: hidden にしたセルを
    // WebKitGTK では含めない（画面には出ている）。一覧の中身は textContent で確かめる
    const body = await driver.findElement(By.css('tbody')).getAttribute('textContent');
    assert.match(body, /tmil/i, 'TMiL 自身が一覧にあるはず');
  });

  it('詳細タブで自分の PID を検索できる', async () => {
    await navigate('詳細');
    const search = await driver.findElement(By.css('input[type="search"]'));
    await search.clear();
    await search.sendKeys('tmil');
    const rows = await driver.wait(until.elementsLocated(By.css('[data-testid="detail-row"]')), TIMEOUT);
    assert.ok(rows.length >= 1);
    await search.clear();
  });

  it('パフォーマンスに CPU とメモリが出る', async () => {
    await navigate('パフォーマンス');
    const heading = await driver.wait(until.elementLocated(By.css('section h2')), TIMEOUT);
    assert.equal(await heading.getText(), 'CPU');
    const list = await driver.findElement(By.css('ul[aria-label="リソース"]')).getText();
    assert.match(list, /メモリ/);
  });

  it('スタートアップ一覧を読み込める', async () => {
    await navigate('スタートアップ アプリ');
    await driver.wait(async () => {
      const text = await driver.findElement(By.css('tbody')).getAttribute('textContent');
      return !text.includes('読み込み中');
    }, TIMEOUT);
  });

  it('設定にバージョンが出る', async () => {
    await navigate('設定');
    const body = await driver.wait(
      until.elementLocated(By.xpath('//*[contains(text(), "TMiL v")]')),
      TIMEOUT,
    );
    assert.match(await body.getText(), /TMiL v\d+\.\d+\.\d+/);
  });
});
