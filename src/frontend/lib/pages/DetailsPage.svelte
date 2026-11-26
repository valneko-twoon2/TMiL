<script lang="ts">
  import type { Api } from '../api/ipc';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { formatBytes, formatPercent, formatRate } from '../format/format';
  import { processStateLabel } from '../format/labels';
  import { DETAIL_NUMERIC, detailValue, type DetailColumn } from '../process/columns';
  import { filterProcesses, nextSort, sortBy, type SortState } from '../process/process';
  import type { Monitor } from '../state/monitor.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    monitor: Monitor;
    api: Api;
    toasts: Toasts;
    query: string;
  }

  const { monitor, api, toasts, query }: Props = $props();

  let sort = $state<SortState<DetailColumn>>({ key: 'name', direction: 'asc' });
  let selected = $state<number | null>(null);
  let busy = $state(false);

  const rows = $derived(sortBy(filterProcesses(monitor.snapshot?.processes ?? [], query), sort, detailValue));
  const exists = $derived(selected !== null && rows.some((r) => r.pid === selected));

  function onsort(key: DetailColumn) {
    sort = nextSort(sort, key, DETAIL_NUMERIC);
  }

  async function endTask() {
    if (selected === null || !exists || busy) return;
    busy = true;
    try {
      const [result] = await api.killProcesses([selected]);
      if (result && !result.ok) toasts.show(result.error ?? '終了できませんでした。', 'error');
      selected = null;
      await monitor.refresh();
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    } finally {
      busy = false;
    }
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
      <tr>
        <SortHeader key="name" label="名前" {sort} {onsort} />
        <SortHeader key="pid" label="PID" {sort} {onsort} align="right" />
        <SortHeader key="state" label="状態" {sort} {onsort} />
        <SortHeader key="user" label="ユーザー名" {sort} {onsort} />
        <SortHeader key="cpu" label="CPU" {sort} {onsort} align="right" />
        <SortHeader key="memory" label="メモリ" {sort} {onsort} align="right" />
        <SortHeader key="disk" label="ディスク" {sort} {onsort} align="right" />
        <SortHeader key="command" label="コマンドライン" {sort} {onsort} />
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
          data-testid="detail-row"
        >
          <td>{p.name}</td>
          <td class="num">{p.pid}</td>
          <td>{processStateLabel(p.state)}</td>
          <td>{p.user}</td>
          <td class="num">{formatPercent(p.cpu)}</td>
          <td class="num">{formatBytes(p.memory)}</td>
          <td class="num">{formatRate(p.diskReadPerSec + p.diskWrittenPerSec)}</td>
          <td class="command-line" title={p.command}>{p.command}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="8" class="empty">
            {monitor.snapshot ? '該当するプロセスはありません' : '読み込み中…'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .command-line {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }
</style>
