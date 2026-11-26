<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Api } from '../api/ipc';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { SEPARATOR } from '../menu/menu';
  import {
    DETAIL_COLUMNS,
    DETAIL_NUMERIC,
    detailLabel,
    detailText,
    detailValue,
    REQUIRED_DETAIL_COLUMN,
    toggleDetailColumn,
    toKillTarget,
    type DetailColumn,
  } from '../process/columns';
  import { filterProcesses, nextSort, sortBy, type SortState } from '../process/process';
  import type { IconStore } from '../state/icons.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { SettingsStore } from '../state/settings.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    monitor: Monitor;
    api: Api;
    toasts: Toasts;
    settings: SettingsStore;
    icons: IconStore;
    menus: ContextMenus;
    query: string;
    /** 開いたときに選んでおくプロセス（プロセス タブの「詳細の表示に移動」） */
    focusPid?: number | null;
  }

  const { monitor, api, toasts, settings, icons, menus, query, focusPid = null }: Props = $props();

  let sort = $state<SortState<DetailColumn>>({ key: 'name', direction: 'asc' });
  let selected = $state<number | null>(untrack(() => focusPid));
  let busy = $state(false);

  const columns = $derived(settings.value.detailColumns);
  // 隠した列で並べていたら、名前の順に戻す
  const activeSort = $derived<SortState<DetailColumn>>(
    columns.includes(sort.key) ? sort : { key: REQUIRED_DETAIL_COLUMN, direction: 'asc' },
  );
  const rows = $derived(
    sortBy(filterProcesses(monitor.snapshot?.processes ?? [], query), activeSort, detailValue),
  );
  const target = $derived(rows.find((r) => r.pid === selected));
  const exists = $derived(target !== undefined);

  // 「詳細の表示に移動」で来たときは、その行が見える位置まで動かす
  $effect(() => {
    if (focusPid === null || !untrack(() => exists)) return;
    void tick().then(() => {
      document.querySelector(`[data-pid="${String(focusPid)}"]`)?.scrollIntoView({ block: 'center' });
    });
  });

  function onsort(key: DetailColumn) {
    sort = nextSort(activeSort, key, DETAIL_NUMERIC);
  }

  async function endTask() {
    if (target === undefined || busy) return;
    busy = true;
    try {
      const [result] = await api.killProcesses([toKillTarget(target)]);
      if (result && !result.ok) toasts.show(result.error ?? '終了できませんでした。', 'error');
      selected = null;
      await monitor.refresh();
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

  function openColumnMenu(event: MouseEvent) {
    const entries = DETAIL_COLUMNS.map((c) => ({
      id: c.key,
      label: c.label,
      checked: columns.includes(c.key),
      disabled: c.key === REQUIRED_DETAIL_COLUMN,
    }));
    menus.open(event, '列の選択', entries, (id) => {
      const column = DETAIL_COLUMNS.find((c) => c.key === id)?.key;
      if (column) settings.update({ detailColumns: toggleDetailColumn(columns, column) });
    });
  }

  function openRowMenu(event: MouseEvent, pid: number) {
    selected = pid;
    const row = rows.find((r) => r.pid === pid);
    const entries = [
      { id: 'end', label: 'タスクを終了する', disabled: busy },
      SEPARATOR,
      { id: 'reveal', label: 'ファイルの場所を開く', disabled: !row?.exe },
    ];
    menus.open(event, 'プロセスの操作', entries, (id) => {
      if (id === 'end') void endTask();
      else if (row?.exe) void reveal(row.exe);
    });
  }
</script>

<PageHeader title="詳細">
  {#snippet actions()}
    <button type="button" class="command" disabled={!exists || busy} onclick={endTask}>
      <Icon name="endTask" />
      タスクを終了する
    </button>
  {/snippet}
</PageHeader>

<div
  class="table-wrap"
  role="presentation"
  onkeydown={(e) => {
    if (e.key === 'Delete') void endTask();
  }}
>
  <table class="table" aria-label="プロセスの詳細">
    <thead>
      <tr oncontextmenu={openColumnMenu} title="右クリックで列を選べます">
        {#each columns as column (column)}
          <SortHeader
            key={column}
            label={detailLabel(column)}
            sort={activeSort}
            {onsort}
            align={DETAIL_NUMERIC.includes(column) ? 'right' : 'left'}
          />
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as p (p.pid)}
        <tr
          class:selected={selected === p.pid}
          tabindex="0"
          onclick={() => (selected = p.pid)}
          onkeydown={(e) => {
            if (e.key === 'Enter') selected = p.pid;
          }}
          oncontextmenu={(e) => {
            openRowMenu(e, p.pid);
          }}
          data-testid="detail-row"
          data-pid={p.pid}
        >
          {#each columns as column (column)}
            {#if column === 'name'}
              <td class="name">
                <ProcessIcon src={icons.get(p.exe)} />
                <span>{p.name}</span>
              </td>
            {:else if column === 'command' || column === 'exe'}
              <td class="long" title={detailText(p, column)}>{detailText(p, column)}</td>
            {:else}
              <td class:num={DETAIL_NUMERIC.includes(column)}>{detailText(p, column)}</td>
            {/if}
          {/each}
        </tr>
      {:else}
        <tr>
          <td colspan={columns.length} class="empty">
            {monitor.snapshot ? '該当するプロセスはありません' : '読み込み中…'}
          </td>
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
  .long {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }
</style>
