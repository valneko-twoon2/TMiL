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

  test('使用率が変わっても行の位置は動かず、見出しを押すと並べ直す', async ({ page }) => {
    await open(page);
    const names = page.getByTestId('process-group').locator('td:first-child');
    const before = await names.allTextContents();
    // モックの CPU 使用率は計測ごとに変わり、CPU の順なら数秒で入れ替わる。しばらく見ても並びは同じ
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(1000);
      expect(await names.allTextContents()).toEqual(before);
    }
    await page.getByRole('columnheader', { name: /名前/ }).click();
    const sorted = await names.allTextContents();
    expect(sorted).not.toEqual(before);
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
      .getByRole('menuitem', { name: 'タスクの終了(E)' })
      .click();
    await expect(page.getByTestId('detail-row')).toHaveCount(0);
  });

  test('右クリックのメニューは本家の詳細タブと同じ並びに、使用状況のグラフを足したもの', async ({ page }) => {
    await open(page, '詳細');
    await page.getByTestId('detail-row').first().click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'プロセスの操作' }).getByRole('menuitem')).toHaveText([
      'タスクの終了(E)',
      'プロセス ツリーの終了(T)',
      '優先度の設定(P)',
      '関係の設定(F)',
      '使用状況のグラフ(G)',
      'ファイルの場所を開く(O)',
      'オンライン検索(N)',
      'プロパティ(R)',
      'サービスに移動(S)',
    ]);
    await expect(page.getByRole('menu', { name: 'プロセスの操作' }).getByRole('menuitemcheckbox')).toHaveText(
      ['効率モード(M)'],
    );
  });

  test('優先度を下の階層から選ぶと、次に開いたときにチェックが付く', async ({ page }) => {
    await open(page, '詳細');
    const row = () => page.getByTestId('detail-row').filter({ hasText: 'OneDrive' });
    await row().click({ button: 'right' });
    await page.getByRole('menuitem', { name: '優先度の設定(P)' }).hover();
    const sub = page.getByRole('menu', { name: '優先度の設定' });
    await expect(sub.getByRole('menuitemcheckbox', { name: '通常', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sub.getByRole('menuitemcheckbox', { name: '高', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('優先度を「高」にしました');

    await row().click({ button: 'right' });
    await page.keyboard.press('p');
    await expect(sub.getByRole('menuitemcheckbox', { name: '高', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sub.getByRole('menuitemcheckbox', { name: 'リアルタイム' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(sub).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: '優先度の設定(P)' })).toBeFocused();
  });

  test('関係の設定で CPU を外すと、次に開いたときも外れている', async ({ page }) => {
    await open(page, '詳細');
    const row = () => page.getByTestId('detail-row').filter({ hasText: 'OneDrive' });
    await row().click({ button: 'right' });
    await page.getByRole('menuitem', { name: '関係の設定(F)' }).click();
    const dialog = page.getByRole('dialog', { name: 'プロセッサの関係' });
    await expect(dialog.getByRole('checkbox', { name: 'CPU 0' })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'CPU 0' }).uncheck();
    await expect(dialog.getByRole('checkbox', { name: '<すべてのプロセッサ>' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);

    await row().click({ button: 'right' });
    await page.keyboard.press('f');
    await expect(dialog.getByRole('checkbox', { name: 'CPU 0' })).not.toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'CPU 1' })).toBeChecked();
    const all = dialog.getByRole('checkbox', { name: '<すべてのプロセッサ>' });
    await all.check();
    await expect(dialog.getByRole('checkbox', { name: 'CPU 0' })).toBeChecked();
    await all.uncheck();
    await expect(dialog.getByRole('checkbox', { name: 'CPU 1' })).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('プロセス ツリーの終了は確かめてから行う', async ({ page }) => {
    await open(page, '詳細');
    const row = page.getByTestId('detail-row').filter({ hasText: 'OneDrive' });
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'プロセス ツリーの終了(T)' }).click();
    const dialog = page.getByRole('dialog', { name: /OneDrive\.exe のプロセス ツリーを終了しますか/ });
    await expect(dialog).toContainText('合わせて 1 個');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(row).toHaveCount(1);

    await row.click({ button: 'right' });
    await page.keyboard.press('t');
    await dialog.getByRole('button', { name: 'プロセス ツリーの終了' }).click();
    await expect(row).toHaveCount(0);
  });

  test('プロパティで詳しい情報を見られる', async ({ page }) => {
    await open(page, '詳細');
    await page.getByTestId('detail-row').filter({ hasText: 'explorer' }).click({ button: 'right' });
    await page.keyboard.press('r');
    const dialog = page.getByRole('dialog', { name: 'explorer.exe のプロパティ' });
    await expect(dialog).toContainText('1008');
    await expect(dialog).toContainText('C:\\Windows\\explorer.exe');
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('列の幅をドラッグで変えられ、次回も残る', async ({ page }) => {
    await open(page, '詳細');
    const header = page.getByRole('columnheader', { name: /^PID/ });
    const before = (await header.boundingBox())?.width ?? 0;
    // 作っている途中で、つかむ場所が半分隣の見出しに重なり、押すと並べ替えになる不具合があった
    const handle = page.getByRole('button', { name: 'PID の幅を変える' });
    const box = await handle.boundingBox();
    if (!box) throw new Error('つかむ場所がありません');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    const after = (await header.boundingBox())?.width ?? 0;
    expect(after - before).toBeGreaterThan(60);

    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: '詳細' }).click();
    expect((await header.boundingBox())?.width ?? 0).toBeCloseTo(after, 0);

    // ダブルクリックで最初の幅に戻る
    await handle.dblclick();
    expect((await header.boundingBox())?.width ?? 0).toBeCloseTo(before, 0);
  });
});

test.describe('右クリック', () => {
  test('プロセスの行ではアプリのメニューが出て、Escape で閉じる', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Code (4)').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'プロセスの操作' });
    // ウィンドウを出しているアプリなので「切り替え」もある。効率モードはチェック付きの項目
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText(['効率モード(M)']);
    await expect(menu.getByRole('menuitem')).toHaveText([
      '展開する(X)',
      '切り替え(S)',
      'タスクの終了(E)',
      '詳細の表示に移動(D)',
      'ファイルの場所を開く(O)',
      'オンライン検索(N)',
    ]);
    await expect(menu.getByRole('menuitem', { name: '展開する(X)' })).toBeFocused();
    // 作っている途中で、区切りの数だけ矢印キーの移動先がずれる不具合があった
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'タスクの終了(E)' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: '詳細の表示に移動(D)' })).toBeFocused();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'オンライン検索(N)' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('メニューから展開と詳細への移動ができる', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Code (4)').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '展開する' }).click();
    await expect(page.locator('tr.child')).toHaveCount(4);

    await groupRow(page, 'エクスプローラー').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '詳細の表示に移動' }).click();
    await expect(page.getByRole('heading', { name: '詳細' })).toBeVisible();
    await expect(page.locator('[data-testid="detail-row"].selected')).toContainText('explorer.exe');
  });

  test('ファイルの場所を開いてもエラーにならない', async ({ page }) => {
    await open(page);
    await groupRow(page, 'エクスプローラー').click({ button: 'right' });
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
    await expect(groupRow(page, 'エクスプローラー').locator('img.process-icon')).toHaveAttribute(
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
    await page.getByRole('button', { name: 'TaskManagerLite に置き換える' }).click();
    await expect(page.getByText('現在: 置き換え中')).toBeVisible();
  });
});
