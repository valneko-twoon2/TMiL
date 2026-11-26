<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { Api } from '../api/ipc';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { formatBytes, formatPercent, formatRate } from '../format/format';
  import { heatLevel, rateLevel, shareOf } from '../format/heat';
  import { processStatusBadge } from '../format/labels';
  import { SEPARATOR, type MenuEntry } from '../menu/menu';
  import {
    GROUP_NUMERIC,
    groupValue,
    selectedTargets,
    type GroupColumn,
    type Selection,
  } from '../process/columns';
  import {
    displayName,
    filterProcesses,
    groupProcesses,
    nextSort,
    sortBy,
    type ProcessGroup,
    type SortState,
  } from '../process/process';
  import type { ProcessInfo } from '../model/types';
  import type { IconStore } from '../state/icons.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    monitor: Monitor;
    api: Api;
    toasts: Toasts;
    icons: IconStore;
    menus: ContextMenus;
    query: string;
    /** 「詳細の表示に移動」で詳細タブを開く */
    ongotodetails?: (pid: number) => void;
  }

  const { monitor, api, toasts, icons, menus, query, ongotodetails }: Props = $props();

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
  const targets = $derived(selectedTargets(selection, groups));

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

  async function reveal(path: string) {
    try {
      await api.revealFile(path);
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    }
  }

  /** 行の右クリック。グループなら代表（最初のプロセス）でファイルの場所や詳細を開く。 */
  function openMenu(event: MouseEvent, group: ProcessGroup, child: ProcessInfo | null) {
    selection = child ? { kind: 'process', pid: child.pid } : { kind: 'group', key: group.key };
    const representative = child ?? group.children[0];
    const multi = child === null && group.children.length > 1;
    const entries: MenuEntry[] = [
      ...(multi
        ? [{ id: 'toggle', label: expanded.has(group.key) ? '折りたたむ' : '展開する' }, SEPARATOR]
        : []),
      { id: 'end', label: 'タスクを終了する', disabled: busy },
      SEPARATOR,
      { id: 'details', label: '詳細の表示に移動', disabled: !representative || !ongotodetails },
      { id: 'reveal', label: 'ファイルの場所を開く', disabled: !representative?.exe },
    ];
    menus.open(event, 'プロセスの操作', entries, (id) => {
      if (id === 'toggle') toggle(group.key);
      else if (id === 'end') void endTask();
      else if (id === 'details' && representative) ongotodetails?.(representative.pid);
      else if (id === 'reveal' && representative?.exe) void reveal(representative.exe);
    });
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
          oncontextmenu={(e) => {
            openMenu(e, group, null);
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
            <ProcessIcon src={icons.get(group.children[0]?.exe ?? '')} />
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
              oncontextmenu={(e) => {
                openMenu(e, group, child);
              }}
            >
              <td class="name">
                <ProcessIcon src={icons.get(child.exe)} />
                <span class="text">{displayName(child.name)} ({child.pid})</span>
              </td>
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
    gap: 6px;
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
