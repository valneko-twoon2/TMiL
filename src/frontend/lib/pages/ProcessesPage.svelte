<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { Api } from '../api/ipc';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { formatBytes, formatPercent, formatRate } from '../format/format';
  import { heatLevel, rateLevel, shareOf } from '../format/heat';
  import { processStatusBadge } from '../format/labels';
  import {
    GROUP_NUMERIC,
    groupValue,
    selectedPids,
    type GroupColumn,
    type Selection,
  } from '../process/columns';
  import {
    displayName,
    filterProcesses,
    groupProcesses,
    nextSort,
    sortBy,
    type SortState,
  } from '../process/process';
  import type { Monitor } from '../state/monitor.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    monitor: Monitor;
    api: Api;
    toasts: Toasts;
    query: string;
  }

  const { monitor, api, toasts, query }: Props = $props();

  let sort = $state<SortState<GroupColumn>>({ key: 'cpu', direction: 'desc' });
  let selection = $state<Selection>(null);
  let busy = $state(false);
  const expanded = new SvelteSet<string>();

  const snapshot = $derived(monitor.snapshot);
  const groups = $derived(
    sortBy(groupProcesses(filterProcesses(snapshot?.processes ?? [], query)), sort, groupValue),
  );
  const memoryTotal = $derived(snapshot?.memory.total ?? 0);
  const totals = $derived({
    cpu: snapshot?.cpu.usage ?? 0,
    memory: shareOf(snapshot?.memory.used ?? 0, memoryTotal),
    disk: (snapshot?.processes ?? []).reduce((sum, p) => sum + p.diskReadPerSec + p.diskWrittenPerSec, 0),
  });
  const targets = $derived(selectedPids(selection, groups));

  function onsort(key: GroupColumn) {
    sort = nextSort(sort, key, GROUP_NUMERIC);
  }

  function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
  }

  async function endTask() {
    if (targets.length === 0 || busy) return;
    busy = true;
    try {
      const results = await api.killProcesses(targets);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toasts.show(failed[0]?.error ?? '終了できませんでした。', 'error');
      }
      selection = null;
      await monitor.refresh();
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    } finally {
      busy = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Delete') void endTask();
  }
</script>

<PageHeader title="プロセス">
  {#snippet actions()}
    <button type="button" class="command" disabled={targets.length === 0 || busy} onclick={endTask}>
      <Icon name="endTask" />
      タスクを終了する
    </button>
  {/snippet}
</PageHeader>

<div class="table-wrap" role="presentation" {onkeydown}>
  <table class="table" aria-label="プロセス一覧">
    <thead>
      <tr>
        <SortHeader key="name" label="名前" {sort} {onsort} />
        <th class="status-col"><span class="plain-head">状態</span></th>
        <SortHeader
          key="cpu"
          label="CPU"
          {sort}
          {onsort}
          align="right"
          summary={formatPercent(totals.cpu, 0)}
        />
        <SortHeader
          key="memory"
          label="メモリ"
          {sort}
          {onsort}
          align="right"
          summary={formatPercent(totals.memory, 0)}
        />
        <SortHeader
          key="disk"
          label="ディスク"
          {sort}
          {onsort}
          align="right"
          summary={formatRate(totals.disk)}
        />
      </tr>
    </thead>
    <tbody>
      {#each groups as group (group.key)}
        {@const multi = group.children.length > 1}
        {@const isOpen = expanded.has(group.key)}
        <tr
          class:selected={selection?.kind === 'group' && selection.key === group.key}
          tabindex="0"
          onclick={() => (selection = { kind: 'group', key: group.key })}
          onkeydown={(e) => {
            if (e.key === 'Enter') selection = { kind: 'group', key: group.key };
          }}
          data-testid="process-group"
        >
          <td class="name">
            {#if multi}
              <button
                type="button"
                class="expander"
                aria-label={isOpen ? '折りたたむ' : '展開する'}
                aria-expanded={isOpen}
                onclick={(e) => {
                  e.stopPropagation();
                  toggle(group.key);
                }}
              >
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
              </button>
            {:else}
              <span class="expander-space"></span>
            {/if}
            <span class="text">{group.name}{multi ? ` (${String(group.children.length)})` : ''}</span>
          </td>
          <td class="status-col">{multi ? '' : processStatusBadge(group.children[0]?.state ?? 'other')}</td>
          <td class="num heat-{heatLevel(group.cpu)}">{formatPercent(group.cpu)}</td>
          <td class="num heat-{heatLevel(shareOf(group.memory, memoryTotal))}">
            {formatBytes(group.memory)}
          </td>
          <td class="num heat-{rateLevel(group.diskPerSec)}">{formatRate(group.diskPerSec)}</td>
        </tr>
        {#if multi && isOpen}
          {#each group.children as child (child.pid)}
            <tr
              class="child"
              class:selected={selection?.kind === 'process' && selection.pid === child.pid}
              tabindex="0"
              onclick={() => (selection = { kind: 'process', pid: child.pid })}
              onkeydown={(e) => {
                if (e.key === 'Enter') selection = { kind: 'process', pid: child.pid };
              }}
            >
              <td class="name"><span class="text">{displayName(child.name)} ({child.pid})</span></td>
              <td class="status-col">{processStatusBadge(child.state)}</td>
              <td class="num heat-{heatLevel(child.cpu)}">{formatPercent(child.cpu)}</td>
              <td class="num heat-{heatLevel(shareOf(child.memory, memoryTotal))}">
                {formatBytes(child.memory)}
              </td>
              <td class="num heat-{rateLevel(child.diskReadPerSec + child.diskWrittenPerSec)}">
                {formatRate(child.diskReadPerSec + child.diskWrittenPerSec)}
              </td>
            </tr>
          {/each}
        {/if}
      {:else}
        <tr>
          <td colspan="5" class="empty">{snapshot ? '該当するプロセスはありません' : '読み込み中…'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .name {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 260px;
  }
  .child .name {
    padding-left: 40px;
  }
  .expander,
  .expander-space {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex: none;
  }
  .expander {
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .expander:hover {
    background: var(--hover);
  }
  .status-col {
    width: 90px;
    color: var(--text-muted);
  }
  .plain-head {
    display: block;
    padding: 6px 10px;
    color: var(--text-muted);
    text-align: left;
  }
  th.status-col {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-weight: normal;
    vertical-align: bottom;
  }
</style>
