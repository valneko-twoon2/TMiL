// 画面の見た目の変化を検出する。基準画像は Linux（CI）で作ったものだけを使う。
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  // 時計を止めて、モックの値とグラフの履歴を毎回同じにする
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await expect(page.getByTestId('process-group').first()).toBeVisible();
  await page.clock.runFor(60_000);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} テーマ`, () => {
    test('プロセス', async ({ page }) => {
      await open(page, scheme);
      await expect(page).toHaveScreenshot(`processes-${scheme}.png`);
    });

    test('パフォーマンス', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'パフォーマンス' }).click();
      await expect(page).toHaveScreenshot(`performance-${scheme}.png`);
    });

    test('スタートアップ アプリ', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'スタートアップ アプリ' }).click();
      await expect(page.getByTestId('startup-row').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`startup-${scheme}.png`);
    });

    test('詳細', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: '詳細' }).click();
      await expect(page).toHaveScreenshot(`details-${scheme}.png`);
    });

    test('アプリの履歴', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'アプリの履歴' }).click();
      await expect(page.getByTestId('history-table').locator('tbody tr').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`history-${scheme}.png`);
    });

    test('ユーザー', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'ユーザー' }).click();
      await expect(page.getByTestId('user-processes-table').locator('tbody tr').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`users-${scheme}.png`);
    });

    test('サービス', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'サービス' }).click();
      await expect(page.getByTestId('services-table').getByText('wuauserv')).toBeVisible();
      await expect(page).toHaveScreenshot(`services-${scheme}.png`);
    });

    test('リソース モニター', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: 'リソース モニター' }).click();
      await page.getByRole('tab', { name: 'ネットワーク' }).click();
      await expect(page.getByTestId('resmon-tcp').getByText('142.250.196.110').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`resmon-${scheme}.png`);
    });

    test('設定', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: '設定' }).click();
      await expect(page.getByText('現在:')).toBeVisible();
      await expect(page).toHaveScreenshot(`settings-${scheme}.png`);
    });
  });
}
