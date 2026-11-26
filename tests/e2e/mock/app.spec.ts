// モックのバックエンドでアプリを操作する E2E。フロントの振る舞いを確かめる。
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, nav?: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('process-group').first()).toBeVisible();
  if (nav) await page.getByRole('navigation').getByRole('button', { name: nav }).click();
}

const groupRow = (page: Page, name: string) => page.getByTestId('process-group').filter({ hasText: name });

test.describe('プロセス', () => {
  test('一覧と合計が表示される', async ({ page }) => {
    await open(page);
    await expect(groupRow(page, 'chrome (6)')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /CPU/ })).toContainText('%');
  });

  test('検索で絞り込める', async ({ page }) => {
    await open(page);
    await page.getByRole('searchbox', { name: '検索' }).fill('chrome');
    await expect(page.getByTestId('process-group')).toHaveCount(1);
  });

  test('グループを展開すると個々のプロセスが出る', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Code (4)').getByRole('button', { name: '展開する' }).click();
    await expect(page.locator('tr.child')).toHaveCount(4);
  });

  test('タスクを終了すると一覧から消える', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Discord').click();
    await page.getByRole('button', { name: 'タスクを終了する' }).click();
    await expect(groupRow(page, 'Discord')).toHaveCount(0);
  });

  test('Delete キーでも終了できる', async ({ page }) => {
    await open(page);
    await groupRow(page, 'OneDrive').click();
    await page.keyboard.press('Delete');
    await expect(groupRow(page, 'OneDrive')).toHaveCount(0);
  });

  test('終了できないときはエラーを出す', async ({ page }) => {
    await open(page);
    await groupRow(page, 'System').click();
    await page.getByRole('button', { name: 'タスクを終了する' }).click();
    await expect(page.getByRole('alert')).toContainText('終了できませんでした');
  });
});

test.describe('パフォーマンス', () => {
  test('リソースを切り替えられる', async ({ page }) => {
    await open(page, 'パフォーマンス');
    await expect(page.getByRole('heading', { name: 'CPU' })).toBeVisible();
    await page.getByRole('button', { name: /メモリ/ }).click();
    await expect(page.getByRole('heading', { name: 'メモリ' })).toBeVisible();
    await expect(page.getByText('利用可能')).toBeVisible();
  });
});

test.describe('スタートアップ アプリ', () => {
  test('無効な項目を有効にできる', async ({ page }) => {
    await open(page, 'スタートアップ アプリ');
    const row = page.getByTestId('startup-row').filter({ hasText: 'Spotify' });
    await expect(row).toContainText('無効');
    await row.click();
    await page.getByRole('button', { name: '有効にする' }).click();
    await expect(row).toContainText('有効');
  });

  test('管理者権限が必要な項目は切り替えられない', async ({ page }) => {
    await open(page, 'スタートアップ アプリ');
    await page.getByTestId('startup-row').filter({ hasText: 'SecurityHealth' }).click();
    await expect(page.getByRole('button', { name: '無効にする' })).toBeDisabled();
  });
});

test.describe('詳細', () => {
  test('PID で検索できる', async ({ page }) => {
    await open(page, '詳細');
    await page.getByRole('searchbox', { name: '検索' }).fill('1008');
    await expect(page.getByTestId('detail-row')).toHaveCount(1);
    await expect(page.getByTestId('detail-row')).toContainText('explorer.exe');
  });
});

test.describe('設定', () => {
  test('テーマを変えると保存される', async ({ page }) => {
    await open(page, '設定');
    await page.getByRole('radio', { name: 'ダーク' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('既定のページを変えると次回その画面で開く', async ({ page }) => {
    await open(page, '設定');
    await page.getByRole('combobox', { name: '既定のページ' }).selectOption('performance');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'パフォーマンス' })).toBeVisible();
  });

  test('タスク マネージャーを置き換えられる', async ({ page }) => {
    await open(page, '設定');
    await page.getByRole('button', { name: 'TMiL に置き換える' }).click();
    await expect(page.getByText('現在: 置き換え中')).toBeVisible();
  });
});
