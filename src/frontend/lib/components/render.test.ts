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
import { Monitor } from '../state/monitor.svelte';
import { SettingsStore } from '../state/settings.svelte';
import { Toasts } from '../state/toast.svelte';
import Icon from './Icon.svelte';
import LineChart from './LineChart.svelte';
import NavRail from './NavRail.svelte';
import PageHeader from './PageHeader.svelte';
import SortHeader from './SortHeader.svelte';

const call: Invoke = () => Promise.reject(new Error('SSR では呼ばない'));
const api = createApi(call);

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

    it('プロセス', () => {
      const props = { monitor: filledMonitor(), api, toasts: new Toasts(), query: '' };
      expect(render(ProcessesPage, { props }).body).toMatchSnapshot();
    });

    it('プロセス（読み込み中）', () => {
      const props = { monitor: new Monitor(api), api, toasts: new Toasts(), query: '' };
      expect(render(ProcessesPage, { props }).body).toContain('読み込み中');
    });

    it('詳細', () => {
      const props = { monitor: filledMonitor(), api, toasts: new Toasts(), query: 'app' };
      expect(render(DetailsPage, { props }).body).toMatchSnapshot();
    });

    it('パフォーマンス', () => {
      expect(render(PerformancePage, { props: { monitor: filledMonitor() } }).body).toMatchSnapshot();
    });

    it('スタートアップ（読み込み前）', () => {
      const props = {
        api: createApi(() => Promise.resolve(startupFixture())),
        toasts: new Toasts(),
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
