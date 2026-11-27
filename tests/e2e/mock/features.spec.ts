// 本家のタスク マネージャーにある機能（新しいタスク・サービス・ユーザー・アプリの履歴・リソース モニターなど）の E2E。
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, nav?: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('process-group').first()).toBeVisible();
  if (nav) await page.getByRole('navigation').getByRole('button', { name: nav, exact: true }).click();
}

const groupRow = (page: Page, name: string) => page.getByTestId('process-group').filter({ hasText: name });

test.describe('サイドバー', () => {
  test('本家と同じページと、リソース モニターが並ぶ', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation');
    for (const name of [
      'プロセス',
      'パフォーマンス',
      'アプリの履歴',
      'スタートアップ アプリ',
      'ユーザー',
      '詳細',
      'サービス',
      'リソース モニター',
      '設定',
    ]) {
      await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });
});

test.describe('新しいタスクの実行', () => {
  test('見つからない名前ではダイアログに理由を出し、正しい名前なら閉じる', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '新しいタスクを実行する' }).click();
    const dialog = page.getByRole('dialog', { name: '新しいタスクの実行' });
    const name = dialog.getByRole('textbox', { name: '名前' });
    await name.fill('nosuchapp');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog.getByRole('alert')).toContainText("'nosuchapp' が見つかりません");
    await name.fill('notepad');
    await dialog.getByRole('checkbox', { name: /管理者特権/ }).check();
    await name.press('Enter');
    await expect(dialog).toHaveCount(0);
  });

  test('どのページの見出しからも開ける', async ({ page }) => {
    await open(page, 'サービス');
    await page.getByRole('button', { name: '新しいタスクを実行する' }).click();
    await expect(page.getByRole('dialog', { name: '新しいタスクの実行' })).toBeVisible();
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('プロセスの種類と列', () => {
  test('アプリ・バックグラウンド・Windows プロセスに分かれ、表示メニューで分けるのをやめられる', async ({
    page,
  }) => {
    await open(page);
    const sections = page.getByTestId('process-section');
    await expect(sections).toHaveText([
      /^アプリ \(\d+\)$/,
      /^バックグラウンド プロセス/,
      /^Windows プロセス/,
    ]);
    await page.getByRole('button', { name: '表示' }).click();
    await page.getByRole('menuitemcheckbox', { name: '種類別にグループ化(G)' }).click();
    await expect(sections).toHaveCount(0);
  });

  test('見出しの右クリックで PID と発行元の列を足せる', async ({ page }) => {
    await open(page);
    await page.getByRole('columnheader', { name: /名前/ }).click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: '発行元' }).click();
    await expect(page.getByRole('columnheader', { name: '発行元' })).toBeVisible();
    await expect(groupRow(page, 'Google Chrome')).toContainText('Google LLC');
  });

  test('本家と同じ GPU エンジン・電力消費・電源の使用率の傾向・分離の列を足せる', async ({ page }) => {
    await open(page);
    for (const name of ['GPU エンジン', '電力消費', '電源の使用率の傾向', '分離']) {
      await page.getByRole('columnheader', { name: /名前/ }).click({ button: 'right' });
      await page.getByRole('menuitemcheckbox', { name }).click();
      await expect(page.getByRole('columnheader', { name })).toBeVisible();
    }
    await expect(groupRow(page, 'Google Chrome')).toContainText('GPU 0 - 3D');
    await expect(groupRow(page, 'RuntimeBroker')).toContainText('AppContainer');
    await expect(groupRow(page, 'Antimalware Service Executable')).toContainText(/非常に低い|低い|中|高い/);
  });

  test('ほかのアプリが自分で入れた効率モードも状態に出る', async ({ page }) => {
    await open(page);
    // モックでは chrome の裏のプロセスの一部が、自分で効率モードに入っている
    await groupRow(page, 'Google Chrome').getByRole('button', { name: '展開する' }).click();
    await expect(page.locator('tr.child', { hasText: '効率モード' })).toHaveCount(3);
  });

  test('効率モードは確かめてから入れ、状態に出る', async ({ page }) => {
    await open(page);
    await groupRow(page, 'Discord').click();
    await page.getByRole('button', { name: '効率モード' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('効率モードをオンにしますか?');
    await dialog.getByRole('button', { name: '効率モードをオンにする' }).click();
    await expect(groupRow(page, 'Discord')).toContainText('効率モード');
  });
});

test.describe('サービス', () => {
  test('止まっているサービスを開始できる', async ({ page }) => {
    await open(page, 'サービス');
    const row = page.getByTestId('services-table').locator('tr', { hasText: 'Print Spooler' });
    await expect(row).toContainText('停止');
    await row.click();
    await page.getByRole('button', { name: '開始', exact: true }).click();
    await expect(row).toContainText('実行中');
    await expect(page.getByRole('status').first()).toContainText('開始しました');
  });

  test('詳細タブの「サービスに移動」で、そのプロセスのサービスだけを出す', async ({ page }) => {
    await open(page, '詳細');
    await page.getByRole('searchbox', { name: '検索' }).fill('1052');
    await page.getByTestId('detail-row').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'サービスに移動(S)' }).click();
    await expect(page.getByRole('heading', { name: 'サービス' })).toBeVisible();
    await expect(page.getByText('PID 1052 のサービスだけを表示しています')).toBeVisible();
    const rows = page.getByTestId('services-table').locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'すべて表示' }).click();
    await expect(rows).not.toHaveCount(2);
  });
});

test.describe('ユーザー', () => {
  test('ユーザーごとにまとめ、選んだユーザーのプロセスを出す', async ({ page }) => {
    await open(page, 'ユーザー');
    const users = page.getByTestId('users-table');
    await expect(users.locator('tr', { hasText: 'SYSTEM' })).toBeVisible();
    await users.locator('tbody tr', { hasText: /^user/ }).click();
    await expect(page.getByRole('heading', { name: 'user のプロセス' })).toBeVisible();
    await expect(page.getByTestId('user-processes-table')).toContainText('chrome.exe');
  });
});

test.describe('アプリの履歴', () => {
  test('使ったアプリが並び、削除すると空になる', async ({ page }) => {
    await open(page, 'アプリの履歴');
    const table = page.getByTestId('history-table');
    // 計測が進むと CPU 時間が積み上がる
    await expect(table.locator('tbody tr', { hasText: 'Google Chrome' })).toBeVisible();
    await page.getByRole('button', { name: '使用状況の履歴の削除' }).click();
    await expect(table.locator('tbody tr', { hasText: 'Google Chrome' })).toContainText('0:00:00');
  });
});

test.describe('リソース モニター', () => {
  test('チェックしたプロセスのモジュールとサービスを出す', async ({ page }) => {
    await open(page, 'リソース モニター');
    await page.getByRole('tab', { name: 'CPU' }).click();
    await page
      .getByTestId('resmon-cpu')
      .getByRole('checkbox', { name: 'svchost.exe を選ぶ' })
      .first()
      .check();
    await expect(page.getByText(/1 個のプロセスで絞り込み中/)).toBeVisible();
    await expect(page.getByTestId('resmon-modules')).toContainText('ntdll.dll');
    await expect(page.getByTestId('resmon-services')).toContainText(/wuauserv|BITS/);
    await page.getByRole('button', { name: '解除' }).click();
    await expect(page.getByText(/個のプロセスで絞り込み中/)).toHaveCount(0);
  });

  test('ネットワークのタブに TCP 接続とリッスン ポートを出す', async ({ page }) => {
    await open(page, 'リソース モニター');
    await page.getByRole('tab', { name: 'ネットワーク' }).click();
    await expect(page.getByTestId('resmon-tcp')).toContainText('142.250.196.110');
    await expect(page.getByTestId('resmon-tcp')).toContainText('接続済み');
    await expect(page.getByTestId('resmon-listen')).toContainText('445');
  });

  test('ポートで絞り込むと、そのポートの接続とプロセスだけが残る', async ({ page }) => {
    await open(page, 'リソース モニター');
    await page.getByRole('tab', { name: 'ネットワーク' }).click();
    await expect(page.getByTestId('resmon-listen')).toContainText('445');
    await page.getByTestId('resmon-port-filter').fill('1420');
    const listen = page.getByTestId('resmon-listen').locator('tbody tr[data-key]');
    await expect(listen).toHaveCount(1);
    await expect(listen).toContainText('1420');
    await expect(page.getByTestId('resmon-tcp').locator('tbody tr[data-key]')).toHaveCount(0);
    await expect(page.getByTestId('resmon-network').locator('tbody tr[data-key]')).toHaveCount(1);
    await page.getByTestId('resmon-port-filter').fill('');
    await expect(page.getByTestId('resmon-tcp')).toContainText('142.250.196.110');
  });

  test('ハンドルを場所で探し、見つからなければ理由を出す', async ({ page }) => {
    await open(page, 'リソース モニター');
    await page.getByRole('tab', { name: 'CPU' }).click();
    const handles = page.getByTestId('resmon-handles');
    await expect(handles).toContainText('場所を入れて検索してください');
    const search = page.getByTestId('resmon-handle-search');
    await search.fill('/tmp/report.docx');
    await search.press('Enter');
    await expect(handles.locator('tbody tr[data-key]')).toHaveCount(2);
    await expect(handles).toContainText('/tmp/report.docx');
    await search.fill('/tmp/nosuch');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect(handles).toContainText('見つかりません');
  });

  test('右のグラフの欄は左の端をドラッグして広げられ、次回も残る', async ({ page }) => {
    await open(page, 'リソース モニター');
    const graphs = page.getByRole('complementary', { name: 'グラフ' });
    const before = (await graphs.boundingBox())?.width ?? 0;
    const handle = page.getByRole('button', { name: 'グラフの欄 の幅を変える' });
    const box = await handle.boundingBox();
    if (!box) throw new Error('つかむ場所がありません');
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + 40, { steps: 4 });
    await page.mouse.up();
    const after = (await graphs.boundingBox())?.width ?? 0;
    expect(after - before).toBeGreaterThan(80);

    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'リソース モニター', exact: true })
      .click();
    expect((await graphs.boundingBox())?.width ?? 0).toBeCloseTo(after, 0);

    await handle.dblclick();
    expect((await graphs.boundingBox())?.width ?? 0).toBeCloseTo(before, 0);
  });

  test('プロセスを右クリックして中断と再開ができる', async ({ page }) => {
    await open(page, 'リソース モニター');
    const row = page.getByTestId('resmon-cpu').locator('tbody tr', { hasText: 'Discord.exe' }).first();
    // スクロールが終わってから開く（スクロールするとメニューは閉じる）
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeInViewport();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'プロセスの中断(S)' }).click();
    await row.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'プロセスの中断(S)' })).toBeDisabled();
    await page.getByRole('menuitem', { name: 'プロセスの再開(R)' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('パフォーマンス', () => {
  test('GPU が並び、CPU のグラフを論理プロセッサごとに分けられる', async ({ page }) => {
    await open(page, 'パフォーマンス');
    await expect(page.getByRole('button', { name: /GPU 0/ })).toBeVisible();
    await page.getByRole('region', { name: 'CPU の詳細' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'グラフの変更(G)' }).hover();
    await page.getByRole('menuitemcheckbox', { name: '論理プロセッサ' }).click();
    await expect(page.getByLabel('論理プロセッサごとのグラフ')).toBeVisible();
  });

  test('概要表示では、グラフでなく色付きの丸で並び、詳細は出ない。もう一度で戻る', async ({ page }) => {
    await open(page, 'パフォーマンス');
    const list = page.getByRole('list', { name: 'リソース' });
    await expect(list.getByRole('img').first()).toBeVisible();
    await list.click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: '概要表示(S)' }).click();
    await expect(list.getByRole('img')).toHaveCount(0);
    await expect(list.locator('i.dot').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'CPU の詳細' })).toHaveCount(0);
    await list.click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: '概要表示(S)' }).click();
    await expect(page.getByRole('region', { name: 'CPU の詳細' })).toBeVisible();
  });

  test('リソース モニターを開ける', async ({ page }) => {
    await open(page, 'パフォーマンス');
    await page.getByRole('button', { name: 'リソース モニターを開く' }).click();
    await expect(page.getByRole('heading', { name: 'リソース モニター' })).toBeVisible();
  });
});

test.describe('使用状況のグラフ', () => {
  test('詳細タブの右クリックから、そのプロセスの CPU とメモリの推移を開ける', async ({ page }) => {
    await open(page, '詳細');
    await page.getByRole('searchbox', { name: '検索' }).fill('1052');
    await page.getByTestId('detail-row').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '使用状況のグラフ(G)' }).click();
    const dialog = page.getByRole('dialog', { name: /の使用状況/ });
    await expect(dialog.getByTestId('usage-charts')).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'CPU のグラフ' })).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'メモリのグラフ' })).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
