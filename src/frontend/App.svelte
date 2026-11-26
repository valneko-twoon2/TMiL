<script lang="ts">
  import { listen } from '@tauri-apps/api/event';
  import { onMount, untrack } from 'svelte';
  import type { Api } from './lib/api/ipc';
  import Icon from './lib/components/Icon.svelte';
  import NavRail from './lib/components/NavRail.svelte';
  import ToastHost from './lib/components/ToastHost.svelte';
  import DetailsPage from './lib/pages/DetailsPage.svelte';
  import PerformancePage from './lib/pages/PerformancePage.svelte';
  import ProcessesPage from './lib/pages/ProcessesPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import StartupPage from './lib/pages/StartupPage.svelte';
  import { intervalOf, type Page } from './lib/settings/settings';
  import type { Monitor } from './lib/state/monitor.svelte';
  import type { SettingsStore } from './lib/state/settings.svelte';
  import type { Toasts } from './lib/state/toast.svelte';

  interface Props {
    api: Api;
    settings: SettingsStore;
    monitor: Monitor;
    toasts: Toasts;
  }

  const { api, settings, monitor, toasts }: Props = $props();

  // 起動時だけ既定のページを使う（設定を変えても今の画面は動かさない）
  let page = $state<Page>(untrack(() => settings.value.startPage));
  let navExpanded = $state(false);
  let query = $state('');

  const searchable = $derived(page === 'processes' || page === 'details' || page === 'startup');

  function onnavigate(next: Page) {
    page = next;
  }

  // 間隔の値が変わったときだけ再設定する（テーマなど他の設定の変更では動かさない）
  const interval = $derived(intervalOf(settings.value.refresh));

  $effect(() => {
    monitor.setInterval(interval);
  });

  $effect(() => {
    const theme = settings.value.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  onMount(() => {
    void monitor.loadSystemInfo();
    const onVisibility = () => {
      monitor.setVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    const unlisten = listen<boolean>('window-visibility', (event) => {
      monitor.setVisible(event.payload);
    }).catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void unlisten.then((stop) => stop?.());
      monitor.stop();
    };
  });
</script>

<div class="app">
  <header class="titlebar">
    <div class="brand">
      <img src="/logo.svg" alt="" width="18" height="18" />
      <span>TMiL</span>
    </div>
    <label class="search" class:disabled={!searchable}>
      <Icon name="search" size={14} />
      <input
        type="search"
        placeholder="名前、PID、ユーザーで検索"
        aria-label="検索"
        bind:value={query}
        disabled={!searchable}
      />
    </label>
    <div class="spacer"></div>
  </header>

  <div class="body">
    <NavRail {page} expanded={navExpanded} {onnavigate} ontoggle={() => (navExpanded = !navExpanded)} />
    <main class="content">
      {#if monitor.error}
        <div class="banner" role="alert">情報を取得できません: {monitor.error}</div>
      {/if}
      {#if page === 'processes'}
        <ProcessesPage {monitor} {api} {toasts} {query} />
      {:else if page === 'performance'}
        <PerformancePage {monitor} />
      {:else if page === 'startup'}
        <StartupPage {api} {toasts} {query} />
      {:else if page === 'details'}
        <DetailsPage {monitor} {api} {toasts} {query} />
      {:else}
        <SettingsPage {settings} {api} {toasts} />
      {/if}
    </main>
  </div>
  <ToastHost {toasts} />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .titlebar {
    display: grid;
    grid-template-columns: 1fr minmax(240px, 480px) 1fr;
    align-items: center;
    gap: 12px;
    height: 44px;
    padding: 0 12px;
    background: var(--bg);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-bottom-color: var(--text-muted);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-muted);
  }
  .search:focus-within {
    border-bottom: 2px solid var(--accent);
  }
  .search.disabled {
    opacity: 0.5;
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    border-top-left-radius: 8px;
    border: 1px solid var(--border);
    border-right: none;
    border-bottom: none;
    background: var(--content);
  }
  .banner {
    margin: 8px 20px 0;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--danger-bg);
    color: var(--danger);
  }
</style>
