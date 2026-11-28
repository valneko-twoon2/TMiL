<script lang="ts">
  import DataTable from '../components/DataTable.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { SEPARATOR, type MenuEntry } from '../menu/menu';
  import type { ServiceAction, ServiceInfo } from '../model/types';
  import { filterServices, SERVICE_COLUMNS, serviceCommands } from '../services/services';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { ProcessActions } from '../state/processActions.svelte';
  import type { ServiceList } from '../state/services.svelte';
  import type { SettingsStore } from '../state/settings.svelte';

  interface Props {
    services: ServiceList;
    settings: SettingsStore;
    menus: ContextMenus;
    processActions: ProcessActions;
    query: string;
    focusPid?: number | null;
    ongotodetails?: (pid: number) => void;
  }

  const {
    services,
    settings,
    menus,
    processActions,
    query,
    focusPid = null,
    ongotodetails,
  }: Props = $props();

  const RELOAD_MS = 5000;

  let selected = $state<string | null>(null);
  let onlyPid = $derived(focusPid);

  const rows = $derived(
    filterServices(services.list, query).filter((s) => onlyPid === null || s.pid === onlyPid),
  );
  const target = $derived(rows.find((s) => s.name === selected));
  const can = $derived(serviceCommands(target));

  $effect(() => {
    void services.load();
    const timer = setInterval(() => void services.load(), RELOAD_MS);
    return () => {
      clearInterval(timer);
    };
  });

  function run(service: ServiceInfo | undefined, action: ServiceAction) {
    if (service) void services.control(service, action);
  }

  function openMenu(event: MouseEvent, s: ServiceInfo) {
    const allowed = serviceCommands(s);
    const entries: MenuEntry[] = [
      { id: 'start', label: '開始', key: 'S', disabled: !allowed.start || services.busy },
      { id: 'stop', label: '停止', key: 'O', disabled: !allowed.stop || services.busy },
      { id: 'restart', label: '再起動', key: 'R', disabled: !allowed.restart || services.busy },
      SEPARATOR,
      { id: 'tool', label: 'サービス管理ツールを開く', key: 'V' },
      { id: 'search', label: 'オンライン検索', key: 'N' },
      { id: 'details', label: '詳細の表示に移動', key: 'D', disabled: s.pid === null || !ongotodetails },
    ];
    menus.open(event, 'サービスの操作', entries, (id) => {
      if (id === 'start' || id === 'stop' || id === 'restart') run(s, id);
      else if (id === 'tool') void services.openTool();
      else if (id === 'search') void processActions.search(s.name);
      else if (id === 'details' && s.pid !== null) ongotodetails?.(s.pid);
    });
  }
</script>

<PageHeader title="サービス">
  {#snippet actions()}
    <button
      type="button"
      class="command"
      disabled={!can.start || services.busy}
      onclick={() => {
        run(target, 'start');
      }}
    >
      <Icon name="play" />
      開始
    </button>
    <button
      type="button"
      class="command"
      disabled={!can.stop || services.busy}
      onclick={() => {
        run(target, 'stop');
      }}
    >
      <Icon name="stop" />
      停止
    </button>
    <button
      type="button"
      class="command"
      disabled={!can.restart || services.busy}
      onclick={() => {
        run(target, 'restart');
      }}
    >
      <Icon name="refresh" />
      再起動
    </button>
    <button
      type="button"
      class="command"
      onclick={() => {
        void services.openTool();
      }}
    >
      <Icon name="services" />
      サービスを開く
    </button>
  {/snippet}
</PageHeader>

{#if services.error}
  <div class="banner" role="alert">サービスの一覧を取れません: {services.error}</div>
{/if}
{#if onlyPid !== null}
  <div class="filter">
    PID {onlyPid} のサービスだけを表示しています
    <button type="button" class="link" onclick={() => (onlyPid = null)}>すべて表示</button>
  </div>
{/if}

<DataTable
  label="サービス一覧"
  table="services"
  columns={SERVICE_COLUMNS}
  {rows}
  rowKey={(s: ServiceInfo) => s.name}
  {settings}
  {selected}
  onselect={(key: string) => (selected = key)}
  oncontextmenu={openMenu}
  empty={services.loaded ? '該当するサービスはありません' : '読み込み中…'}
  testid="services-table"
/>

<style>
  .banner {
    margin: 0 20px 8px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--danger-bg);
    color: var(--danger);
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 20px 8px;
    color: var(--text-muted);
  }
  .link {
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
</style>
