import { mount } from 'svelte';
import App from './App.svelte';
import { api } from './lib/api/ipc';
import { IconStore } from './lib/state/icons.svelte';
import { ContextMenus } from './lib/state/menus.svelte';
import { Monitor } from './lib/state/monitor.svelte';
import { SettingsStore } from './lib/state/settings.svelte';
import { Toasts } from './lib/state/toast.svelte';
import './app.css';

async function start(): Promise<void> {
  // E2E・VRT 用のモック版ビルドでだけ、偽のバックエンドを差し込む
  if (import.meta.env.MODE === 'mock') {
    const { installMock } = await import('./lib/mock/install');
    installMock();
  }
  const target = document.getElementById('app');
  if (!target) throw new Error('#app が見つかりません');
  mount(App, {
    target,
    props: {
      api,
      settings: new SettingsStore(window.localStorage),
      monitor: new Monitor(api),
      toasts: new Toasts(),
      icons: new IconStore(api),
      menus: new ContextMenus(),
    },
  });
}

void start();
