<script lang="ts">
  import { onMount } from 'svelte';
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
  import type { IconStore } from '../state/icons.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    api: Api;
    toasts: Toasts;
    icons: IconStore;
    menus: ContextMenus;
    query: string;
  }

  const { api, toasts, icons, menus, query }: Props = $props();

  let entries = $state<StartupEntry[] | null>(null);
  let selectedId = $state<string | null>(null);
  let sort = $state<SortState<StartupColumn>>({ key: 'name', direction: 'asc' });
  let busy = $state(false);

  const rows = $derived(sortBy(filterStartup(entries ?? [], query), sort, startupValue));
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

  function openMenu(event: MouseEvent, entry: StartupEntry) {
    selectedId = entry.id;
    const items = [
      {
        id: 'toggle',
        label: entry.enabled ? '無効にする' : '有効にする',
        disabled: !entry.canToggle || busy,
      },
      SEPARATOR,
      { id: 'reveal', label: 'ファイルの場所を開く', disabled: entry.program === '' },
    ];
    menus.open(event, 'スタートアップ アプリの操作', items, (id) => {
      if (id === 'toggle') void toggle(entry);
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
  <table class="table" aria-label="スタートアップ アプリ">
    <thead>
      <tr>
        <SortHeader key="name" label="名前" {sort} {onsort} />
        <SortHeader key="program" label="プログラム" {sort} {onsort} />
        <SortHeader key="location" label="場所" {sort} {onsort} />
        <SortHeader key="enabled" label="状態" {sort} {onsort} />
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
          <td class="name"><ProcessIcon src={icons.get(e.program)} /><span>{e.name}</span></td>
          <td class="program" title={e.command}>{e.program}</td>
          <td>{startupLocationLabel(e.location)}</td>
          <td class:disabled-text={!e.enabled}>{e.enabled ? '有効' : '無効'}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="4" class="empty">{entries ? 'スタートアップ アプリはありません' : '読み込み中…'}</td>
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
  }
  .program {
    max-width: 380px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }
  .disabled-text {
    color: var(--text-muted);
  }
</style>
