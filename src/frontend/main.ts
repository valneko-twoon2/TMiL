import { mount } from 'svelte';
import App from './App.svelte';
import { api } from './lib/api/ipc';
import { AppHistoryStore } from './lib/state/appHistory.svelte';
import { AppWindows } from './lib/state/appWindows.svelte';
import { IconStore } from './lib/state/icons.svelte';
import { ContextMenus } from './lib/state/menus.svelte';
import { Monitor } from './lib/state/monitor.svelte';
import { ProcessActions } from './lib/state/processActions.svelte';
import { ResourceMonitorState } from './lib/state/resmon.svelte';
import { RunTask } from './lib/state/runTask.svelte';
import { ServiceList } from './lib/state/services.svelte';
import { SettingsStore } from './lib/state/settings.svelte';
import { Toasts } from './lib/state/toast.svelte';
import './app.css';

async function start(): Promise<void> {
  if (import.meta.env.MODE === 'mock') {
    const { installMock } = await import('./lib/mock/install');
    installMock();
  }
  const target = document.getElementById('app');
  if (!target) throw new Error('#app が見つかりません');
  const monitor = new Monitor(api);
  const toasts = new Toasts();
  const menus = new ContextMenus();
  const settings = new SettingsStore(window.localStorage);
  mount(App, {
    target,
    props: {
      api,
      settings,
      monitor,
      toasts,
      icons: new IconStore(api),
      menus,
      processActions: new ProcessActions(api, monitor, toasts, menus, {
        confirmEfficiency: () => settings.value.confirmEfficiency,
      }),
      services: new ServiceList(api, toasts),
      appWindows: new AppWindows(api),
      appHistory: new AppHistoryStore(window.localStorage),
      runTask: new RunTask(api),
      resmon: new ResourceMonitorState(api),
    },
  });
}

void start();
