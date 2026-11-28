<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Api } from '../api/ipc';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { startupLocationLabel } from '../format/labels';
  import { SEPARATOR } from '../menu/menu';
  import type { StartupEntry } from '../model/types';
  import { nextSort, sortBy, type SortState } from '../process/process';
  import { filterStartup, startupValue, type StartupColumn } from '../startup/startup';
  import { ColumnSizer } from '../state/columnSizer.svelte';
  import type { IconStore } from '../state/icons.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { SettingsStore } from '../state/settings.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    api: Api;
    toasts: Toasts;
    icons: IconStore;
    menus: ContextMenus;
    settings: SettingsStore;
    query: string;
  }

  const { api, toasts, icons, menus, settings, query }: Props = $props();

  const COLUMNS = ['name', 'publisher', 'program', 'location', 'enabled'] as const;
  const sizer = untrack(() => new ColumnSizer(settings, 'startup'));
  const resizer = (column: string) => (width: number | null, done: boolean) => {
    sizer.resize(column, width, done);
  };

  let entries = $state<StartupEntry[] | null>(null);
  let selectedId = $state<string | null>(null);
  let sort = $state<SortState<StartupColumn>>({ key: 'name', direction: 'asc' });
  let busy = $state(false);

  const company = (exe: string) => icons.company(exe);
  const rows = $derived(
    sortBy(filterStartup(entries ?? [], query), sort, (e, column) => startupValue(e, column, company)),
  );
  const selected = $derived(rows.find((e) => e.id === selectedId) ?? null);

  function onsort(key: StartupColumn) {
    sort = nextSort(sort, key, []);
  }

  async function load() {
    try {
      entries = await api.startupEntries();
      void icons.request(entries.map((e) => e.program));
    } catch (cause) {
      entries = [];
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }

  async function toggle(entry: StartupEntry | null = selected) {
    if (!entry?.canToggle || busy) return;
    busy = true;
    try {
      await api.setStartupEnabled(entry.id, !entry.enabled);
      await load();
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    } finally {
      busy = false;
    }
  }

  async function reveal(path: string) {
    try {
      await api.revealFile(path);
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }

  async function search(name: string) {
    try {
      await api.searchOnline(name);
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }

  function openMenu(event: MouseEvent, entry: StartupEntry) {
    selectedId = entry.id;
    const items = [
      {
        id: 'toggle',
        label: entry.enabled ? '無効にする' : '有効にする',
        key: entry.enabled ? 'A' : 'E',
        disabled: !entry.canToggle || busy,
      },
      SEPARATOR,
      { id: 'reveal', label: 'ファイルの場所を開く', key: 'O', disabled: entry.program === '' },
      { id: 'search', label: 'オンライン検索', key: 'S' },
    ];
    menus.open(event, 'スタートアップ アプリの操作', items, (id) => {
      if (id === 'toggle') void toggle(entry);
      else if (id === 'search') void search(entry.name);
      else void reveal(entry.program);
    });
  }

  onMount(() => {
    void load();
  });
</script>

<PageHeader title="スタートアップ アプリ">
  {#snippet actions()}
    <button type="button" class="command" onclick={load} disabled={busy}>
      <Icon name="refresh" />
      最新の情報に更新
    </button>
    <button
      type="button"
      class="command"
      disabled={!selected?.canToggle || busy}
      title={selected && !selected.canToggle ? '管理者権限が必要な項目です' : undefined}
      onclick={() => toggle()}
    >
      <Icon name={selected?.enabled === false ? 'enable' : 'disable'} />
      {selected?.enabled === false ? '有効にする' : '無効にする'}
    </button>
  {/snippet}
</PageHeader>

<div class="table-wrap">
  <table
    class="table resizable"
    aria-label="スタートアップ アプリ"
    style:min-width="{sizer.total(COLUMNS)}px"
  >
    <colgroup>
      {#each COLUMNS as column (column)}
        <col style:width="{sizer.width(column)}px" />
      {/each}
      <col />
    </colgroup>
    <thead>
      <tr>
        {#each [['name', '名前'], ['publisher', '発行元'], ['program', 'プログラム'], ['location', '場所'], ['enabled', '状態']] as const as [key, label] (key)}
          <SortHeader {key} {label} {sort} {onsort} width={sizer.width(key)} onresize={resizer(key)} />
        {/each}
        <th class="filler"></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as e (e.id)}
        <tr
          class:selected={selectedId === e.id}
          tabindex="0"
          onclick={() => (selectedId = e.id)}
          onkeydown={(ev) => {
            if (ev.key === 'Enter') selectedId = e.id;
          }}
          oncontextmenu={(ev) => {
            openMenu(ev, e);
          }}
          data-testid="startup-row"
        >
          <td>
            <span class="name">
              <ProcessIcon src={icons.get(e.program)} /><span class="text">{e.name}</span>
            </span>
          </td>
          <td class="program">{company(e.program)}</td>
          <td class="program" title={e.command}>{e.program}</td>
          <td>{startupLocationLabel(e.location)}</td>
          <td class:disabled-text={!e.enabled}>{e.enabled ? '有効' : '無効'}</td>
          <td class="filler"></td>
        </tr>
      {:else}
        <tr>
          <td colspan="6" class="empty">{entries ? 'スタートアップ アプリはありません' : '読み込み中…'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .program {
    color: var(--text-muted);
  }
  .disabled-text {
    color: var(--text-muted);
  }
</style>
