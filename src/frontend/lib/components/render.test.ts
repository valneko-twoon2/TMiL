// 画面部品をサーバー描画して HTML をスナップショットで固定する。
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { readFixture, snapshotFixture, startupFixture, systemInfoFixture } from '../../test/fixtures';
import { createApi, type Invoke } from '../api/ipc';
import { EMPTY_HISTORY, recordSnapshot } from '../history/history';
import type { ServiceInfo } from '../model/types';
import AppHistoryPage from '../pages/AppHistoryPage.svelte';
import ResourceMonitorPage from '../pages/ResourceMonitorPage.svelte';
import ServicesPage from '../pages/ServicesPage.svelte';
import UsersPage from '../pages/UsersPage.svelte';
import { AppHistoryStore } from '../state/appHistory.svelte';
import { AppWindows } from '../state/appWindows.svelte';
import { ResourceMonitorState } from '../state/resmon.svelte';
import { RunTask } from '../state/runTask.svelte';
import { ServiceList } from '../state/services.svelte';
import RunTaskDialog from './RunTaskDialog.svelte';
import DetailsPage from '../pages/DetailsPage.svelte';
import PerformancePage from '../pages/PerformancePage.svelte';
import ProcessesPage from '../pages/ProcessesPage.svelte';
import SettingsPage from '../pages/SettingsPage.svelte';
import StartupPage from '../pages/StartupPage.svelte';
import { IconStore } from '../state/icons.svelte';
import type { TableColumn } from '../table/table';
import { ContextMenus } from '../state/menus.svelte';
import { Monitor } from '../state/monitor.svelte';
import { ProcessActions } from '../state/processActions.svelte';
import { SettingsStore } from '../state/settings.svelte';
import { Toasts } from '../state/toast.svelte';
import ContextMenuHost from './ContextMenuHost.svelte';
import ProcessDialogs from './ProcessDialogs.svelte';
import DataTable from './DataTable.svelte';
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
    processIcons: (exes) =>
      Promise.resolve(
        exes.map((e) => ({ exe: e, icon: e === exe ? ICON : null, description: null, company: null })),
      ),
  });
  if (exe) await store.request([exe]);
  return store;
}

const actionsFor = (monitor: Monitor) => new ProcessActions(api, monitor, new Toasts(), new ContextMenus());
const noWindows = () => new AppWindows({ appWindows: () => Promise.resolve([]) });

function loadedServices(): ServiceList {
  const services = new ServiceList(api, new Toasts());
  services.list = readFixture('services') as ServiceInfo[];
  services.loaded = true;
  return services;
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
      const monitor = filledMonitor();
      const props = {
        monitor,
        settings: new SettingsStore(undefined),
        icons: await iconStore(firstExe()),
        menus: new ContextMenus(),
        processActions: actionsFor(monitor),
        appWindows: noWindows(),
        query: '',
      };
      expect(render(ProcessesPage, { props }).body).toMatchSnapshot();
    });

    it('プロセス（読み込み中）', async () => {
      const monitor = new Monitor(api);
      const props = {
        monitor,
        settings: new SettingsStore(undefined),
        icons: await iconStore(undefined),
        menus: new ContextMenus(),
        processActions: actionsFor(monitor),
        appWindows: noWindows(),
        query: '',
      };
      expect(render(ProcessesPage, { props }).body).toContain('読み込み中');
    });

    it('詳細', async () => {
      const monitor = filledMonitor();
      const props = {
        monitor,
        processActions: actionsFor(monitor),
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
      const monitor = filledMonitor();
      const props = {
        monitor,
        processActions: actionsFor(monitor),
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
        settings: new SettingsStore(undefined),
        query: '',
      };
      expect(render(StartupPage, { props }).body).toMatchSnapshot();
    });

    it('ユーザー', async () => {
      const monitor = filledMonitor();
      const props = {
        monitor,
        settings: new SettingsStore(undefined),
        icons: await iconStore(firstExe()),
        processActions: actionsFor(monitor),
        query: '',
      };
      expect(render(UsersPage, { props }).body).toMatchSnapshot();
    });

    it('サービス', () => {
      const monitor = filledMonitor();
      const props = {
        services: loadedServices(),
        settings: new SettingsStore(undefined),
        menus: new ContextMenus(),
        processActions: actionsFor(monitor),
        query: '',
      };
      expect(render(ServicesPage, { props }).body).toMatchSnapshot();
    });

    it('サービス（PID で絞り込み）', () => {
      const monitor = filledMonitor();
      const props = {
        services: loadedServices(),
        settings: new SettingsStore(undefined),
        menus: new ContextMenus(),
        processActions: actionsFor(monitor),
        query: '',
        focusPid: 100,
      };
      const body = render(ServicesPage, { props }).body;
      expect(body).toContain('PID 100 のサービスだけを表示しています');
      expect(body).toContain('svc0');
      expect(body).not.toContain('svc1');
    });

    it('アプリの履歴', async () => {
      const history = new AppHistoryStore(undefined, 0);
      const snapshot = snapshotFixture();
      history.record(snapshot);
      const later = {
        ...snapshot,
        timestampMs: snapshot.timestampMs + 1000,
        processes: snapshot.processes.map((p) => ({ ...p, cpuTimeMs: p.cpuTimeMs + 3_600_000 })),
      };
      history.record(later);
      const props = {
        history,
        settings: new SettingsStore(undefined),
        icons: await iconStore(undefined),
        query: '',
      };
      const body = render(AppHistoryPage, { props }).body;
      expect(body).toContain('使用状況の履歴の削除');
      expect(body).toContain('1:00:00');
      expect(body).toContain('CPU 時間');
    });

    it('リソース モニター（概要）', async () => {
      const monitor = filledMonitor();
      const resmon = new ResourceMonitorState(api);
      const snapshot = monitor.snapshot;
      if (snapshot) resmon.record(snapshot);
      const props = {
        monitor,
        settings: new SettingsStore(undefined),
        icons: await iconStore(firstExe()),
        menus: new ContextMenus(),
        processActions: actionsFor(monitor),
        services: loadedServices(),
        resmon,
      };
      expect(render(ResourceMonitorPage, { props }).body).toMatchSnapshot();
    });

    it('使用状況のグラフ（メモリ増加中）', () => {
      const monitor = filledMonitor();
      const actions = actionsFor(monitor);
      const first = snapshotFixture().processes[0];
      if (!first) throw new Error('fixture');
      for (let i = 0; i < 120; i += 1) {
        actions.usage.record({
          processes: [{ ...first, cpu: i % 10, memory: 100 * 1024 ** 2 + i * 2 * 1024 ** 2 }],
        });
      }
      expect(actions.marks(first).growing).toBe(true);
      actions.showUsage(first);
      const body = render(ProcessDialogs, { props: { actions, intervalMs: 1000 } }).body;
      expect(body).toContain('直近 2 分の推移');
      expect(body).toContain('メモリ リークの可能性があります');
      expect(body).toMatchSnapshot();
    });

    it('使用状況のグラフ（記録なし）', () => {
      const monitor = filledMonitor();
      const actions = actionsFor(monitor);
      const first = snapshotFixture().processes[0];
      if (!first) throw new Error('fixture');
      actions.showUsage(first);
      const body = render(ProcessDialogs, { props: { actions } }).body;
      expect(body).toContain('まだ記録がないか');
      expect(body).not.toContain('メモリ リーク');
    });

    it('新しいタスクの実行', () => {
      const runTask = new RunTask(api);
      expect(render(RunTaskDialog, { props: { runTask } }).body).not.toContain('dialog');
      runTask.show();
      runTask.error = "'x' が見つかりません。";
      expect(render(RunTaskDialog, { props: { runTask } }).body).toMatchSnapshot();
    });

    it('設定', () => {
      const props = { settings: new SettingsStore(undefined), api, toasts: new Toasts() };
      expect(render(SettingsPage, { props }).body).toMatchSnapshot();
    });
  });

  describe('regression', () => {
    // アイコンをまだ読めていない行（System など）だけ、アイコンの場所が無くなり名前がずれていた
    it('共通の表で、アイコンの無い行にも決まった絵を出す', () => {
      // サーバー描画では行の型を推論できないので、unknown の行として渡す
      const name = (r: unknown) => (r as { name: string }).name;
      const columns: TableColumn<unknown>[] = [
        { key: 'name', label: '名前', value: name, icon: () => undefined },
      ];
      const props = {
        label: '表',
        table: 'test',
        columns,
        rows: [{ name: 'System' }],
        rowKey: name,
        settings: new SettingsStore(undefined),
      };
      expect(render(DataTable, { props }).body).toContain('process-icon fallback');
    });
  });
});
