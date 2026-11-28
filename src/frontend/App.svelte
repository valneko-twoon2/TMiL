<script lang="ts">
  import { listen } from '@tauri-apps/api/event';
  import { onMount, untrack } from 'svelte';
  import type { Api } from './lib/api/ipc';
  import ContextMenuHost from './lib/components/ContextMenuHost.svelte';
  import Icon from './lib/components/Icon.svelte';
  import NavRail from './lib/components/NavRail.svelte';
  import ProcessDialogs from './lib/components/ProcessDialogs.svelte';
  import RunTaskDialog from './lib/components/RunTaskDialog.svelte';
  import ToastHost from './lib/components/ToastHost.svelte';
  import { allowsNativeMenu } from './lib/menu/menu';
  import AppHistoryPage from './lib/pages/AppHistoryPage.svelte';
  import DetailsPage from './lib/pages/DetailsPage.svelte';
  import PerformancePage from './lib/pages/PerformancePage.svelte';
  import ProcessesPage from './lib/pages/ProcessesPage.svelte';
  import ResourceMonitorPage from './lib/pages/ResourceMonitorPage.svelte';
  import ServicesPage from './lib/pages/ServicesPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import StartupPage from './lib/pages/StartupPage.svelte';
  import UsersPage from './lib/pages/UsersPage.svelte';
  import { intervalOf, type Page } from './lib/settings/settings';
  import { shortcutOf } from './lib/shortcuts/shortcuts';
  import type { AppHistoryStore } from './lib/state/appHistory.svelte';
  import type { AppWindows } from './lib/state/appWindows.svelte';
  import type { IconStore } from './lib/state/icons.svelte';
  import type { ContextMenus } from './lib/state/menus.svelte';
  import type { Monitor } from './lib/state/monitor.svelte';
  import type { ProcessActions } from './lib/state/processActions.svelte';
  import type { ResourceMonitorState } from './lib/state/resmon.svelte';
  import { SummaryView } from './lib/state/summaryView.svelte';
  import { provideRunTask, type RunTask } from './lib/state/runTask.svelte';
  import type { ServiceList } from './lib/state/services.svelte';
  import type { SettingsStore } from './lib/state/settings.svelte';
  import type { Toasts } from './lib/state/toast.svelte';

  interface Props {
    api: Api;
    settings: SettingsStore;
    monitor: Monitor;
    toasts: Toasts;
    icons: IconStore;
    menus: ContextMenus;
    processActions: ProcessActions;
    services: ServiceList;
    appWindows: AppWindows;
    appHistory: AppHistoryStore;
    runTask: RunTask;
    resmon: ResourceMonitorState;
  }

  const {
    api,
    settings,
    monitor,
    toasts,
    icons,
    menus,
    processActions,
    services,
    appWindows,
    appHistory,
    runTask,
    resmon,
  }: Props = $props();

  provideRunTask(untrack(() => runTask));
  const summaryView = untrack(() => new SummaryView(api, toasts));

  let page = $state<Page>(untrack(() => settings.value.startPage));
  let navExpanded = $state(false);
  let query = $state('');
  let search = $state<HTMLInputElement | null>(null);
  let detailsFocus = $state<number | null>(null);
  let servicesFocus = $state<number | null>(null);

  const SEARCHABLE: readonly Page[] = ['processes', 'details', 'startup', 'users', 'services', 'history'];
  const searchable = $derived(SEARCHABLE.includes(page));

  function onnavigate(next: Page) {
    page = next;
    detailsFocus = null;
    servicesFocus = null;
  }

  function gotoDetails(pid: number) {
    query = '';
    detailsFocus = pid;
    page = 'details';
  }

  function gotoServices(pid: number) {
    query = '';
    servicesFocus = pid;
    page = 'services';
  }

  $effect(() => {
    const processes = monitor.snapshot?.processes;
    if (processes) void icons.request(processes.map((p) => p.exe));
  });

  $effect(() => {
    const snapshot = monitor.snapshot;
    if (!snapshot) return;
    untrack(() => {
      appHistory.record(snapshot);
      resmon.record(snapshot);
      processActions.usage.record(snapshot);
    });
  });

  const interval = $derived(intervalOf(settings.value.refresh));

  $effect(() => {
    monitor.setInterval(interval);
  });

  $effect(() => {
    const theme = settings.value.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  const alwaysOnTop = $derived(settings.value.alwaysOnTop);
  $effect(() => {
    api.setAlwaysOnTop(alwaysOnTop).catch((cause: unknown) => {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    });
  });

  function onkeydown(event: KeyboardEvent) {
    const action = shortcutOf(event);
    if (action === null) return;
    // F5 で WebView が読み込み直さないよう、こちらで受け持つ
    event.preventDefault();
    if (action === 'refresh') void monitor.refresh();
    else if (action === 'search' && searchable) search?.focus();
    else if (action === 'runTask') runTask.show();
  }

  onMount(() => {
    void monitor.loadSystemInfo();
    const onVisibility = () => {
      monitor.setVisible(document.visibilityState === 'visible');
      if (document.visibilityState === 'hidden') appHistory.save();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // WebView 標準の右クリックメニュー（戻る・再読み込み・検証など）は出さない。入力欄だけは残す
    const onContextMenu = (event: MouseEvent) => {
      if (!allowsNativeMenu(event.target)) event.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    const unlisten = listen<boolean>('window-visibility', (event) => {
      monitor.setVisible(event.payload);
      if (!event.payload) appHistory.save();
    }).catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', onContextMenu);
      void unlisten.then((stop) => stop?.());
      monitor.stop();
      appHistory.save();
    };
  });
</script>

<svelte:window {onkeydown} />

<div class="app">
  {#if !summaryView.on}
    <header class="titlebar" data-tauri-drag-region>
      <div class="spacer" data-tauri-drag-region></div>
      <label class="search" class:disabled={!searchable}>
        <Icon name="search" size={14} />
        <input
          bind:this={search}
          type="search"
          placeholder="名前、PID、ユーザーで検索"
          aria-label="検索"
          bind:value={query}
          disabled={!searchable}
        />
      </label>
      <div class="spacer" data-tauri-drag-region></div>
    </header>
  {/if}

  <div class="body">
    {#if !summaryView.on}
      <NavRail {page} expanded={navExpanded} {onnavigate} ontoggle={() => (navExpanded = !navExpanded)} />
    {/if}
    <main class="content">
      {#if monitor.error}
        <div class="banner" role="alert">情報を取得できません: {monitor.error}</div>
      {/if}
      {#if page === 'processes'}
        <ProcessesPage
          {monitor}
          {settings}
          {icons}
          {menus}
          {processActions}
          {appWindows}
          {query}
          ongotodetails={gotoDetails}
        />
      {:else if page === 'performance'}
        <PerformancePage
          {monitor}
          {menus}
          {toasts}
          {summaryView}
          intervalMs={interval}
          onopenresmon={() => (page = 'resmon')}
        />
      {:else if page === 'history'}
        <AppHistoryPage history={appHistory} {settings} {icons} {query} />
      {:else if page === 'startup'}
        <StartupPage {api} {toasts} {icons} {menus} {settings} {query} />
      {:else if page === 'users'}
        <UsersPage {monitor} {settings} {icons} {processActions} {query} ongotodetails={gotoDetails} />
      {:else if page === 'details'}
        {#key detailsFocus}
          <DetailsPage
            {monitor}
            {settings}
            {icons}
            {menus}
            {processActions}
            {query}
            focusPid={detailsFocus}
            ongotoservices={gotoServices}
          />
        {/key}
      {:else if page === 'services'}
        <ServicesPage
          {services}
          {settings}
          {menus}
          {processActions}
          {query}
          focusPid={servicesFocus}
          ongotodetails={gotoDetails}
        />
      {:else if page === 'resmon'}
        <ResourceMonitorPage {monitor} {settings} {icons} {menus} {processActions} {services} {resmon} />
      {:else}
        <SettingsPage {settings} {api} {toasts} />
      {/if}
    </main>
  </div>
  <ToastHost {toasts} />
  <ContextMenuHost {menus} />
  <ProcessDialogs actions={processActions} intervalMs={interval} />
  <RunTaskDialog {runTask} />
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
