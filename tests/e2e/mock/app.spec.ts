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

  test('見出しの右クリックで列を選べ、次回も残る', async ({ page }) => {
    await open(page, '詳細');
    const table = page.getByRole('table', { name: 'プロセスの詳細' });
    await expect(table.getByRole('columnheader', { name: 'イメージ パス名' })).toHaveCount(0);
    await table.getByRole('columnheader', { name: /PID/ }).click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '列の選択' });
    await expect(menu.getByRole('menuitemcheckbox', { name: '名前' })).toBeDisabled();
    await menu.getByRole('menuitemcheckbox', { name: 'イメージ パス名' }).click();
    await expect(menu).toHaveCount(0);
    await expect(table.getByRole('columnheader', { name: 'イメージ パス名' })).toBeVisible();

    await table.getByRole('columnheader', { name: /PID/ }).click({ button: 'right' });
    await menu.getByRole('menuitemcheckbox', { name: 'ユーザー名' }).click();
    await expect(table.getByRole('columnheader', { name: 'ユーザー名' })).toHaveCount(0);

    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: '詳細' }).click();
    await expect(table.getByRole('columnheader', { name: 'イメージ パス名' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'ユーザー名' })).toHaveCount(0);
  });

  test('行の右クリックからタスクを終了できる', async ({ page }) => {
    await open(page, '詳細');
    await page.getByRole('searchbox', { name: '検索' }).fill('OneDrive');
    await page.getByTestId('detail-row').click({ button: 'right' });
    await page
      .getByRole('menu', { name: 'プロセスの操作' })
      .getByRole('menuitem', { name: 'タスクを終了する' })
      .click();
    await expect(page.getByTestId('detail-row')).toHaveCount(0);
  });
});

test.describe('右クリック', () => {
  test('プロセスの行ではアプリのメニューが出て、Escape で閉じる', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Code (4)').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'プロセスの操作' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      '展開する',
      'タスクを終了する',
      '詳細の表示に移動',
      'ファイルの場所を開く',
    ]);
    await expect(menu.getByRole('menuitem', { name: '展開する' })).toBeFocused();
    // 作っている途中で、区切りの数だけ矢印キーの移動先がずれる不具合があった
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'タスクを終了する' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: '詳細の表示に移動' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'ファイルの場所を開く' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('メニューから展開と詳細への移動ができる', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Code (4)').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '展開する' }).click();
    await expect(page.locator('tr.child')).toHaveCount(4);

    await groupRow(page, 'explorer').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '詳細の表示に移動' }).click();
    await expect(page.getByRole('heading', { name: '詳細' })).toBeVisible();
    await expect(page.locator('[data-testid="detail-row"].selected')).toContainText('explorer.exe');
  });

  test('ファイルの場所を開いてもエラーにならない', async ({ page }) => {
    await open(page);
    await groupRow(page, 'explorer').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'ファイルの場所を開く' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('スタートアップの行から有効・無効を切り替えられる', async ({ page }) => {
    await open(page, 'スタートアップ アプリ');
    const row = page.getByTestId('startup-row').filter({ hasText: 'Spotify' });
    await expect(row).toContainText('無効');
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '有効にする' }).click();
    await expect(row).toContainText('有効');
  });

  // 以前は WebView 標準のメニュー（戻る・再読み込み・検証など）がどこでも出ていた
  test('入力欄以外では WebView 標準のメニューを出さない', async ({ page }) => {
    await open(page);
    const prevented = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          el.dispatchEvent(event);
          return event.defaultPrevented;
        });
    expect(await prevented('.titlebar')).toBe(true);
    expect(await prevented('h1')).toBe(true);
    expect(await prevented('input[type="search"]')).toBe(false);
  });
});

test.describe('アイコン', () => {
  test('プロセスと詳細の行にアイコンが出る', async ({ page }) => {
    await open(page);
    await expect(groupRow(page, 'explorer').locator('img.process-icon')).toHaveAttribute(
      'src',
      /^data:image\/svg\+xml;base64,/,
    );
    // 実行ファイルが分からないもの（System）は決まった絵
    await expect(groupRow(page, 'System').locator('.process-icon.fallback')).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: '詳細' }).click();
    await expect(page.getByTestId('detail-row').first().locator('.process-icon')).toBeVisible();
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
