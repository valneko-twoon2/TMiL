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

    test('設定', async ({ page }) => {
      await open(page, scheme);
      await page.getByRole('navigation').getByRole('button', { name: '設定' }).click();
      await expect(page.getByText('現在:')).toBeVisible();
      await expect(page).toHaveScreenshot(`settings-${scheme}.png`);
    });
  });
}
