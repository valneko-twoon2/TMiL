<script lang="ts">
  import { listen } from '@tauri-apps/api/event';
  import { onMount, untrack } from 'svelte';
  import type { Api } from './lib/api/ipc';
  import ContextMenuHost from './lib/components/ContextMenuHost.svelte';
  import ProcessDialogs from './lib/components/ProcessDialogs.svelte';
  import Icon from './lib/components/Icon.svelte';
  import NavRail from './lib/components/NavRail.svelte';
  import ToastHost from './lib/components/ToastHost.svelte';
  import DetailsPage from './lib/pages/DetailsPage.svelte';
  import PerformancePage from './lib/pages/PerformancePage.svelte';
  import ProcessesPage from './lib/pages/ProcessesPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import StartupPage from './lib/pages/StartupPage.svelte';
  import { allowsNativeMenu } from './lib/menu/menu';
  import { intervalOf, type Page } from './lib/settings/settings';
  import type { IconStore } from './lib/state/icons.svelte';
  import type { ContextMenus } from './lib/state/menus.svelte';
  import type { ProcessActions } from './lib/state/processActions.svelte';
  import type { Monitor } from './lib/state/monitor.svelte';
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
  }

  const { api, settings, monitor, toasts, icons, menus, processActions }: Props = $props();

  // 起動時だけ既定のページを使う（設定を変えても今の画面は動かさない）
  let page = $state<Page>(untrack(() => settings.value.startPage));
  let navExpanded = $state(false);
  let query = $state('');
  /** 詳細タブで選んでおくプロセス（プロセス タブから移ってきたとき） */
  let detailsFocus = $state<number | null>(null);

  const searchable = $derived(page === 'processes' || page === 'details' || page === 'startup');

  function onnavigate(next: Page) {
    page = next;
    detailsFocus = null;
  }

  function gotoDetails(pid: number) {
    // 検索で隠れないよう、絞り込みを外してから移る
    query = '';
    detailsFocus = pid;
    page = 'details';
  }

  // 一覧に出てきた実行ファイルのアイコンを取りに行く（覚えているものは聞かない）
  $effect(() => {
    const processes = monitor.snapshot?.processes;
    if (processes) void icons.request(processes.map((p) => p.exe));
  });

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
    // WebView 標準の右クリックメニュー（戻る・再読み込み・検証など）は出さない。入力欄だけは残す
    const onContextMenu = (event: MouseEvent) => {
      if (!allowsNativeMenu(event.target)) event.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    const unlisten = listen<boolean>('window-visibility', (event) => {
      monitor.setVisible(event.payload);
    }).catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', onContextMenu);
      void unlisten.then((stop) => stop?.());
      monitor.stop();
    };
  });
</script>

<div class="app">
  <header class="titlebar">
    <div class="brand">
      <img src="/logo.svg" alt="" width="18" height="18" />
      <span>TaskManagerLite</span>
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
        <ProcessesPage
          {monitor}
          {settings}
          {icons}
          {menus}
          {processActions}
          {query}
          ongotodetails={gotoDetails}
        />
      {:else if page === 'performance'}
        <PerformancePage {monitor} intervalMs={interval} />
      {:else if page === 'startup'}
        <StartupPage {api} {toasts} {icons} {menus} {settings} {query} />
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
          />
        {/key}
      {:else}
        <SettingsPage {settings} {api} {toasts} />
      {/if}
    </main>
  </div>
  <ToastHost {toasts} />
  <ContextMenuHost {menus} />
  <ProcessDialogs actions={processActions} />
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
