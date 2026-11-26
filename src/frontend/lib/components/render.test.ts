// 画面部品をサーバー描画して HTML をスナップショットで固定する。
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { snapshotFixture, startupFixture, systemInfoFixture } from '../../test/fixtures';
import { createApi, type Invoke } from '../api/ipc';
import { EMPTY_HISTORY, recordSnapshot } from '../history/history';
import DetailsPage from '../pages/DetailsPage.svelte';
import PerformancePage from '../pages/PerformancePage.svelte';
import ProcessesPage from '../pages/ProcessesPage.svelte';
import SettingsPage from '../pages/SettingsPage.svelte';
import StartupPage from '../pages/StartupPage.svelte';
import { IconStore } from '../state/icons.svelte';
import { ContextMenus } from '../state/menus.svelte';
import { Monitor } from '../state/monitor.svelte';
import { SettingsStore } from '../state/settings.svelte';
import { Toasts } from '../state/toast.svelte';
import ContextMenuHost from './ContextMenuHost.svelte';
import Icon from './Icon.svelte';
import LineChart from './LineChart.svelte';
import NavRail from './NavRail.svelte';
import PageHeader from './PageHeader.svelte';
import ProcessIcon from './ProcessIcon.svelte';
import SortHeader from './SortHeader.svelte';

const call: Invoke = () => Promise.reject(new Error('SSR では呼ばない'));
const api = createApi(call);
const ICON = 'data:image/png;base64,iVBORw0KGgo=';

/** 渡した実行ファイルにだけアイコンがある状態（ほかは決まった絵になる）。 */
async function iconStore(exe: string | undefined): Promise<IconStore> {
  const store = new IconStore({
    processIcons: (exes) => Promise.resolve(exes.map((e) => ({ exe: e, icon: e === exe ? ICON : null }))),
  });
  if (exe) await store.request([exe]);
  return store;
}

const firstExe = (): string | undefined => snapshotFixture().processes[0]?.exe;

function filledMonitor(): Monitor {
  const monitor = new Monitor(api);
  const snapshot = snapshotFixture();
  monitor.snapshot = snapshot;
  monitor.systemInfo = systemInfoFixture();
  monitor.history = recordSnapshot(recordSnapshot(EMPTY_HISTORY, snapshot), snapshot);
  return monitor;
}

describe('画面部品', () => {
  describe('snapshot', () => {
    it('Icon', () => {
      expect(render(Icon, { props: { name: 'search', label: '検索' } }).body).toMatchSnapshot();
    });

    it('LineChart', () => {
      const series = [{ label: '使用率', values: [0, 50, 100], color: '#1e88e5' }];
      expect(render(LineChart, { props: { series, max: 100, label: 'CPU' } }).body).toMatchSnapshot();
    });

    it('NavRail', () => {
      const props = {
        page: 'performance' as const,
        expanded: true,
        onnavigate: () => undefined,
        ontoggle: () => undefined,
      };
      expect(render(NavRail, { props }).body).toMatchSnapshot();
    });

    it('PageHeader', () => {
      expect(render(PageHeader, { props: { title: 'プロセス' } }).body).toMatchSnapshot();
    });

    it('SortHeader', () => {
      const props = {
        key: 'cpu',
        label: 'CPU',
        sort: { key: 'cpu', direction: 'desc' as const },
        onsort: () => undefined,
        align: 'right' as const,
        summary: '12%',
      };
      expect(render(SortHeader, { props }).body).toMatchSnapshot();
    });

    it('プロセス', async () => {
      const props = {
        monitor: filledMonitor(),
        api,
        toasts: new Toasts(),
        icons: await iconStore(firstExe()),
        menus: new ContextMenus(),
        query: '',
      };
      expect(render(ProcessesPage, { props }).body).toMatchSnapshot();
    });

    it('プロセス（読み込み中）', async () => {
      const props = {
        monitor: new Monitor(api),
        api,
        toasts: new Toasts(),
        icons: await iconStore(undefined),
        menus: new ContextMenus(),
        query: '',
      };
      expect(render(ProcessesPage, { props }).body).toContain('読み込み中');
    });

    it('詳細', async () => {
      const props = {
        monitor: filledMonitor(),
        api,
        toasts: new Toasts(),
        settings: new SettingsStore(undefined),
        icons: await iconStore(firstExe()),
        menus: new ContextMenus(),
        query: 'app',
      };
      expect(render(DetailsPage, { props }).body).toMatchSnapshot();
    });

    it('詳細（選んだ列だけ出す）', async () => {
      const settings = new SettingsStore(undefined);
      settings.update({ detailColumns: ['name', 'parentPid', 'exe'] });
      const props = {
        monitor: filledMonitor(),
        api,
        toasts: new Toasts(),
        settings,
        icons: await iconStore(undefined),
        menus: new ContextMenus(),
        query: '',
      };
      const body = render(DetailsPage, { props }).body;
      expect(body).toContain('親 PID');
      expect(body).toContain('イメージ パス名');
      expect(body).not.toContain('コマンドライン');
      expect(body).not.toContain('ユーザー名');
    });

    it('ProcessIcon', () => {
      expect(render(ProcessIcon, { props: { src: ICON } }).body).toMatchSnapshot();
      expect(render(ProcessIcon, { props: { src: null } }).body).toMatchSnapshot();
    });

    it('右クリックメニュー', () => {
      const menus = new ContextMenus();
      menus.current = {
        x: 10,
        y: 10,
        label: '列の選択',
        entries: [
          { id: 'name', label: '名前', checked: true, disabled: true },
          { separator: true },
          { id: 'pid', label: 'PID', checked: false },
          { id: 'end', label: 'タスクを終了する' },
        ],
        onselect: () => undefined,
      };
      expect(render(ContextMenuHost, { props: { menus } }).body).toMatchSnapshot();
      expect(render(ContextMenuHost, { props: { menus: new ContextMenus() } }).body).not.toContain('menu');
    });

    it('パフォーマンス', () => {
      expect(
        render(PerformancePage, { props: { monitor: filledMonitor(), intervalMs: 1000 } }).body,
      ).toMatchSnapshot();
    });

    it('スタートアップ（読み込み前）', async () => {
      const props = {
        api: createApi(() => Promise.resolve(startupFixture())),
        toasts: new Toasts(),
        icons: await iconStore(undefined),
        menus: new ContextMenus(),
        query: '',
      };
      expect(render(StartupPage, { props }).body).toMatchSnapshot();
    });

    it('設定', () => {
      const props = { settings: new SettingsStore(undefined), api, toasts: new Toasts() };
      expect(render(SettingsPage, { props }).body).toMatchSnapshot();
    });
  });
});
