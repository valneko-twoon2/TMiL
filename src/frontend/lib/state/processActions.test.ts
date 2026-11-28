import { describe, expect, it, vi } from 'vitest';
import { snapshotFixture, systemInfoFixture } from '../../test/fixtures';
import { createApi, type Invoke } from '../api/ipc';
import { isItem, type MenuItem } from '../menu/menu';
import type { ProcessInfo } from '../model/types';
import { ColumnSizer } from './columnSizer.svelte';
import { ContextMenus } from './menus.svelte';
import { Monitor } from './monitor.svelte';
import { priorityEntries, priorityOf, ProcessActions, processMenuEntries } from './processActions.svelte';
import { SettingsStore } from './settings.svelte';
import { Toasts } from './toast.svelte';

function proc(pid: number, parentPid: number | null, exe = 'C:\\a.exe'): ProcessInfo {
  const base = snapshotFixture().processes[0];
  if (!base) throw new Error('fixture');
  return { ...base, pid, parentPid, exe, name: `p${String(pid)}`, startTime: 1000 + pid };
}

function setup(
  answers: Record<string, (args: Record<string, unknown>) => unknown> = {},
  confirmEfficiency = true,
) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  const call: Invoke = (cmd, args = {}) => {
    calls.push({ cmd, args });
    const answer = answers[cmd];
    if (!answer) return Promise.resolve(null);
    try {
      return Promise.resolve(answer(args));
    } catch (cause) {
      return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  };
  const api = createApi(call);
  const monitor = new Monitor(api);
  monitor.refresh = vi.fn(() => Promise.resolve());
  monitor.systemInfo = { ...systemInfoFixture(), logicalCores: 4 };
  const toasts = new Toasts();
  const menus = new ContextMenus();
  const actions = new ProcessActions(api, monitor, toasts, menus, {
    confirmEfficiency: () => confirmEfficiency,
  });
  return { actions, calls, monitor, toasts, menus };
}

/** テスト環境には MouseEvent が無いので、使う所だけを持った値で代わりにする。 */
const rightClick = (x: number, y: number) =>
  ({
    clientX: x,
    clientY: y,
    currentTarget: null,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as MouseEvent;

const ok = (args: Record<string, unknown>) =>
  (args.targets as { pid: number }[]).map(({ pid }) => ({ pid, ok: true, error: null }));
const labels = (entries: ReturnType<typeof processMenuEntries>) => entries.filter(isItem).map((e) => e.label);

describe('プロセスへの操作', () => {
  describe('equivalence', () => {
    it('メニューは本家の詳細タブと同じ並びに、使用状況のグラフを足したもの', () => {
      expect(labels(processMenuEntries(proc(1, null), 'normal', false))).toEqual([
        'タスクの終了',
        'プロセス ツリーの終了',
        '効率モード',
        '優先度の設定',
        '関係の設定',
        '使用状況のグラフ',
        'ファイルの場所を開く',
        'オンライン検索',
        'プロパティ',
      ]);
    });

    it('今の優先度にチェックを付け、選んだ項目から優先度を読む', () => {
      const entries = priorityEntries('high') as MenuItem[];
      expect(entries.filter((e) => e.checked).map((e) => e.label)).toEqual(['高']);
      expect(priorityOf('priority:belowNormal')).toBe('belowNormal');
      expect(priorityOf('end')).toBeNull();
    });

    it('ページの項目を足せる', () => {
      const entries = processMenuEntries(proc(1, null), null, false, {
        before: [{ id: 'toggle', label: '展開する' }],
        beforeReveal: [{ id: 'details', label: '詳細の表示に移動' }],
      });
      const names = labels(entries);
      expect(names[0]).toBe('展開する');
      expect(names.indexOf('詳細の表示に移動')).toBe(names.indexOf('ファイルの場所を開く') - 1);
    });

    it('効率モードは確かめてから入れ、もう一度選ぶと外す', async () => {
      const { actions, calls } = setup({ set_process_efficiency: ok });
      const p = proc(5, null);
      actions.toggleEfficiency([p]);
      expect(actions.dialog?.kind).toBe('efficiency');
      expect(calls.some((c) => c.cmd === 'set_process_efficiency')).toBe(false);
      await actions.confirmEfficiency();
      expect(actions.marks(p).efficient).toBe(true);
      const efficient = processMenuEntries(p, null, false, {}, true).find(
        (e) => isItem(e) && e.id === 'efficiency',
      ) as MenuItem;
      expect(efficient.checked).toBe(true);
      actions.toggleEfficiency([p]);
      await vi.waitFor(() => {
        expect(actions.marks(p).efficient).toBe(false);
      });
      expect(calls.filter((c) => c.cmd === 'set_process_efficiency').map((c) => c.args.enabled)).toEqual([
        true,
        false,
      ]);
    });

    it('設定で確認を切ると、すぐに効率モードを入れる', async () => {
      const { actions, calls } = setup({ set_process_efficiency: ok }, false);
      actions.toggleEfficiency([proc(5, null)]);
      expect(actions.dialog).toBeNull();
      await vi.waitFor(() => {
        expect(calls.some((c) => c.cmd === 'set_process_efficiency')).toBe(true);
      });
    });

    it('中断と再開は成功したものだけ印を付け外しする', async () => {
      const failSecond = (args: Record<string, unknown>) =>
        (args.targets as { pid: number }[]).map(({ pid }) => ({
          pid,
          ok: pid !== 2,
          error: pid === 2 ? '権限がありません' : null,
        }));
      const { actions, toasts } = setup({ suspend_processes: failSecond, resume_processes: ok });
      const [a, b] = [proc(1, null), proc(2, null)];
      await actions.suspend([a, b]);
      expect(actions.marks(a).suspended).toBe(true);
      expect(actions.marks(b).suspended).toBe(false);
      expect(toasts.items.at(-1)?.text).toBe('権限がありません');
      await actions.resume([a]);
      expect(actions.marks(a).suspended).toBe(false);
    });

    it('ツリーの終了は子から先に送る', async () => {
      const { actions, calls, monitor } = setup({ kill_processes: ok });
      const root = proc(10, null);
      monitor.snapshot = {
        ...snapshotFixture(),
        processes: [root, proc(11, 10), proc(12, 11), proc(20, null)],
      };
      actions.confirmTree(root);
      expect(actions.dialog?.kind).toBe('tree');
      await actions.endTree();
      expect(actions.dialog).toBeNull();
      const sent = calls.find((c) => c.cmd === 'kill_processes')?.args.targets as { pid: number }[];
      expect(sent.map((t) => t.pid)).toEqual([12, 11, 10]);
    });

    it('優先度を変えたら知らせる', async () => {
      const { actions, calls, toasts } = setup({ set_process_priority: ok });
      await actions.setPriority(proc(5, null), 'high');
      expect(calls[0]?.args).toMatchObject({ priority: 'high', targets: [{ pid: 5, startTime: 1005 }] });
      expect(toasts.items[0]?.text).toContain('「高」');
    });

    it('関係の設定は今の設定を読んでから選ばせ、選んだ CPU を送る', async () => {
      const { actions, calls } = setup({
        process_controls: () => ({ priority: 'normal', affinity: [0, 2] }),
        set_process_affinity: ok,
      });
      await actions.openAffinity(proc(5, null));
      expect(actions.dialog).toMatchObject({ kind: 'affinity', cpus: [0, 2], cores: 4 });
      await actions.applyAffinity([1, 3]);
      expect(calls.find((c) => c.cmd === 'set_process_affinity')?.args.cpus).toEqual([1, 3]);
      expect(actions.dialog).toBeNull();
    });

    it('右クリックのあと、今の優先度が届いたらチェックを付け直す', async () => {
      const { actions, menus } = setup({ process_controls: () => ({ priority: 'low', affinity: null }) });
      const event = rightClick(5, 5);
      actions.openMenu(event, proc(5, null));
      await vi.waitFor(() => {
        const priority = menus.current?.entries.find((e) => isItem(e) && e.id === 'priority') as MenuItem;
        const checked = (priority.children as MenuItem[]).find((c) => c.checked);
        expect(checked?.label).toBe('低');
      });
    });

    it('メニューの項目から各操作を呼ぶ', async () => {
      const { actions, menus, calls } = setup({
        process_controls: () => ({ priority: null, affinity: null }),
      });
      const p = proc(5, null);
      const pick = (id: string) => {
        actions.openMenu(rightClick(5, 5), p);
        menus.select(id);
      };
      pick('properties');
      expect(actions.dialog).toMatchObject({ kind: 'properties' });
      actions.close();
      pick('search');
      pick('reveal');
      await vi.waitFor(() => {
        expect(calls.map((c) => c.cmd)).toEqual(expect.arrayContaining(['search_online', 'reveal_file']));
      });
      expect(calls.find((c) => c.cmd === 'search_online')?.args.query).toBe('p5');
    });
  });

  describe('boundary', () => {
    it('実行ファイルが分からなければファイルの場所は選べない', () => {
      const reveal = processMenuEntries(proc(1, null, ''), null, false)
        .filter(isItem)
        .find((e) => e.id === 'reveal');
      expect(reveal?.disabled).toBe(true);
    });

    it('処理中は終了を選べない', () => {
      const end = processMenuEntries(proc(1, null), null, true)
        .filter(isItem)
        .find((e) => e.id === 'end');
      expect(end?.disabled).toBe(true);
    });

    it('関係の今の設定が読めなければ、すべてのプロセッサから始める', async () => {
      const { actions } = setup({
        process_controls: () => {
          throw new Error('x');
        },
      });
      await actions.openAffinity(proc(5, null));
      expect(actions.dialog).toMatchObject({ cpus: [0, 1, 2, 3] });
    });

    it('関係の設定を読んでいる間にダイアログが閉じたり変わったりしたら、届いた設定で戻さない', async () => {
      const answers: ((value: unknown) => void)[] = [];
      const { actions } = setup({
        process_controls: () =>
          new Promise((resolve) => {
            answers.push(resolve);
          }),
      });
      const answer = () => answers.shift()?.({ priority: null, affinity: [0] });

      const closed = actions.openAffinity(proc(5, null));
      actions.close();
      answer();
      await closed;
      expect(actions.dialog).toBeNull();

      const replaced = actions.openAffinity(proc(5, null));
      actions.showUsage(proc(5, null));
      answer();
      await replaced;
      expect(actions.dialog).toMatchObject({ kind: 'usage' });

      const first = actions.openAffinity(proc(5, null));
      const second = actions.openAffinity(proc(6, null));
      answer();
      await first;
      expect(actions.dialog).toMatchObject({ kind: 'affinity', process: { pid: 6 }, cpus: null });
      answer();
      await second;
      expect(actions.dialog).toMatchObject({ kind: 'affinity', process: { pid: 6 }, cpus: [0] });
    });

    it('CPU を 1 つも選ばなければ送らない', async () => {
      const { actions, calls } = setup({ process_controls: () => ({ priority: null, affinity: [0] }) });
      await actions.openAffinity(proc(5, null));
      await actions.applyAffinity([]);
      expect(calls.some((c) => c.cmd === 'set_process_affinity')).toBe(false);
    });

    it('一覧に無いプロセスのツリーは、そのプロセスだけ', () => {
      const { actions } = setup();
      actions.confirmTree(proc(99, null));
      expect(actions.dialog).toMatchObject({ kind: 'tree', members: [{ pid: 99 }] });
    });

    it('失敗したらエラーを出す', async () => {
      const { actions, toasts } = setup({
        set_process_priority: (args) =>
          (args.targets as { pid: number }[]).map(({ pid }) => ({
            pid,
            ok: false,
            error: '権限が足りません',
          })),
      });
      await actions.setPriority(proc(4, null), 'realtime');
      expect(toasts.items[0]).toMatchObject({ kind: 'error', text: '権限が足りません' });
    });
  });

  describe('regression', () => {
    it('ほかのアプリが自分で入れた効率モード（OS から読んだ値）も印を出し、選ぶと外す', async () => {
      // 以前は、このアプリで入れたものしか効率モードと出なかった
      const { actions, calls } = setup({ set_process_efficiency: ok });
      const p = { ...proc(6, null), efficient: true };
      expect(actions.marks(p).efficient).toBe(true);
      expect(actions.marks(proc(6, null)).efficient).toBe(false);
      actions.toggleEfficiency([p]);
      await vi.waitFor(() => {
        expect(calls.filter((c) => c.cmd === 'set_process_efficiency').map((c) => c.args.enabled)).toEqual([
          false,
        ]);
      });
    });
  });
});

describe('列の幅の保持', () => {
  describe('equivalence', () => {
    it('ドラッグ中は保存せず、つかみ終えたら保存する', () => {
      const settings = new SettingsStore(undefined);
      const sizer = new ColumnSizer(settings, 'details');
      sizer.resize('pid', 150, false);
      expect(sizer.width('pid')).toBe(150);
      expect(settings.value.columnWidths).toEqual({});
      sizer.resize('pid', 160, true);
      expect(settings.value.columnWidths).toEqual({ 'details.pid': 160 });
      expect(sizer.total(['pid', 'cpu'])).toBe(160 + 70);
    });
  });

  describe('boundary', () => {
    it('ダブルクリック（null）で最初の幅に戻す', () => {
      const settings = new SettingsStore(undefined);
      const sizer = new ColumnSizer(settings, 'details');
      sizer.resize('pid', 300, true);
      sizer.resize('pid', null, true);
      expect(sizer.width('pid')).toBe(70);
    });
  });
});
