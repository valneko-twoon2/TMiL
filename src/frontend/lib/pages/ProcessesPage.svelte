<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import ResizeHandle from '../components/ResizeHandle.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { formatBytes, formatPercent, formatRate } from '../format/format';
  import { heatLevel, rateLevel, shareOf } from '../format/heat';
  import { processStatusBadge } from '../format/labels';
  import { SEPARATOR, type MenuEntry, type MenuItem } from '../menu/menu';
  import type { ProcessInfo } from '../model/types';
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
  import { ColumnSizer } from '../state/columnSizer.svelte';
  import type { IconStore } from '../state/icons.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { ProcessActions } from '../state/processActions.svelte';
  import type { SettingsStore } from '../state/settings.svelte';

  interface Props {
    monitor: Monitor;
    settings: SettingsStore;
    icons: IconStore;
    menus: ContextMenus;
    processActions: ProcessActions;
    query: string;
    /** 「詳細の表示に移動」で詳細タブを開く */
    ongotodetails?: (pid: number) => void;
  }

  const { monitor, settings, icons, menus, processActions, query, ongotodetails }: Props = $props();

  const COLUMNS = ['name', 'status', 'cpu', 'memory', 'disk'] as const;

  let sort = $state<SortState<GroupColumn>>({ key: 'cpu', direction: 'desc' });
  let selection = $state<Selection>(null);
  const expanded = new SvelteSet<string>();
  const sizer = untrack(() => new ColumnSizer(settings, 'processes'));

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
  const resizer = (column: string) => (width: number | null, done: boolean) => {
    sizer.resize(column, width, done);
  };

  function onsort(key: GroupColumn) {
    sort = nextSort(sort, key, GROUP_NUMERIC);
  }

  function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
  }

  async function endTask() {
    const all = groups.flatMap((g) => g.children);
    const chosen = all.filter((p) => targets.some((t) => t.pid === p.pid));
    if (chosen.length === 0) return;
    await processActions.end(chosen);
    selection = null;
  }

  /**
   * 行の右クリック。1 つのプロセスの行は詳細タブと同じメニュー（優先度なども選べる）。
   * 複数のプロセスをまとめた行は、まとめて扱えるものだけを出す。
   */
  function openMenu(event: MouseEvent, group: ProcessGroup, child: ProcessInfo | null) {
    selection = child ? { kind: 'process', pid: child.pid } : { kind: 'group', key: group.key };
    const representative = child ?? group.children[0];
    if (!representative) return;
    const multi = child === null && group.children.length > 1;
    const toggleItem: MenuItem = {
      id: 'toggle',
      label: expanded.has(group.key) ? '折りたたむ' : '展開する',
      key: 'X',
    };
    const detailsItem: MenuItem = {
      id: 'details',
      label: '詳細の表示に移動',
      key: 'D',
      disabled: !ongotodetails,
    };
    const onextra = (id: string) => {
      if (id === 'toggle') toggle(group.key);
      else if (id === 'details') ongotodetails?.(representative.pid);
    };
    const onend = () => {
      void endTask();
    };
    if (!multi) {
      processActions.openMenu(event, representative, { middle: [detailsItem], onextra, onend });
      return;
    }
    const entries: MenuEntry[] = [
      toggleItem,
      SEPARATOR,
      { id: 'end', label: 'タスクの終了', key: 'E', disabled: processActions.busy },
      SEPARATOR,
      detailsItem,
      { id: 'reveal', label: 'ファイルの場所を開く', key: 'O', disabled: representative.exe === '' },
      { id: 'search', label: 'オンライン検索', key: 'N' },
    ];
    menus.open(event, 'プロセスの操作', entries, (id) => {
      if (id === 'end') onend();
      else if (id === 'reveal') void processActions.reveal(representative.exe);
      else if (id === 'search') void processActions.search(group.name);
      else onextra(id);
    });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Delete') void endTask();
  }
</script>

<PageHeader title="プロセス">
  {#snippet actions()}
    <button
      type="button"
      class="command"
      disabled={targets.length === 0 || processActions.busy}
      onclick={endTask}
    >
      <Icon name="endTask" />
      タスクを終了する
    </button>
  {/snippet}
</PageHeader>

<div class="table-wrap" role="presentation" {onkeydown}>
  <table class="table resizable" aria-label="プロセス一覧" style:min-width="{sizer.total(COLUMNS)}px">
    <colgroup>
      {#each COLUMNS as column (column)}
        <col style:width="{sizer.width(column)}px" />
      {/each}
      <col />
    </colgroup>
    <thead>
      <tr>
        <SortHeader
          key="name"
          label="名前"
          {sort}
          {onsort}
          width={sizer.width('name')}
          onresize={resizer('name')}
        />
        <th class="status-col">
          <span class="plain-head">状態</span>
          <ResizeHandle width={sizer.width('status')} label="状態" onresize={resizer('status')} />
        </th>
        <SortHeader
          key="cpu"
          label="CPU"
          {sort}
          {onsort}
          align="right"
          summary={formatPercent(totals.cpu, 0)}
          width={sizer.width('cpu')}
          onresize={resizer('cpu')}
        />
        <SortHeader
          key="memory"
          label="メモリ"
          {sort}
          {onsort}
          align="right"
          summary={formatPercent(totals.memory, 0)}
          width={sizer.width('memory')}
          onresize={resizer('memory')}
        />
        <SortHeader
          key="disk"
          label="ディスク"
          {sort}
          {onsort}
          align="right"
          summary={formatRate(totals.disk)}
          width={sizer.width('disk')}
          onresize={resizer('disk')}
        />
        <th class="filler"></th>
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
          <td>
            <span class="name">
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
            </span>
          </td>
          <td class="status-col">
            {#if !multi && group.children[0]}
              {processStatusBadge(group.children[0].state, processActions.marks(group.children[0]))}
            {/if}
          </td>
          <td class="num heat-{heatLevel(group.cpu)}">{formatPercent(group.cpu)}</td>
          <td class="num heat-{heatLevel(shareOf(group.memory, memoryTotal))}">
            {formatBytes(group.memory)}
          </td>
          <td class="num heat-{rateLevel(group.diskPerSec)}">{formatRate(group.diskPerSec)}</td>
          <td class="filler"></td>
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
              <td>
                <span class="name">
                  <ProcessIcon src={icons.get(child.exe)} />
                  <span class="text">{displayName(child.name)} ({child.pid})</span>
                </span>
              </td>
              <td class="status-col">{processStatusBadge(child.state, processActions.marks(child))}</td>
              <td class="num heat-{heatLevel(child.cpu)}">{formatPercent(child.cpu)}</td>
              <td class="num heat-{heatLevel(shareOf(child.memory, memoryTotal))}">
                {formatBytes(child.memory)}
              </td>
              <td class="num heat-{rateLevel(child.diskReadPerSec + child.diskWrittenPerSec)}">
                {formatRate(child.diskReadPerSec + child.diskWrittenPerSec)}
              </td>
              <td class="filler"></td>
            </tr>
          {/each}
        {/if}
      {:else}
        <tr>
          <td colspan="6" class="empty">{snapshot ? '該当するプロセスはありません' : '読み込み中…'}</td>
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
    min-width: 0;
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
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
