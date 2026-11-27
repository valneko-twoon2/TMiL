<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import { formatPercent, formatRate } from '../format/format';
  import { shareOf } from '../format/heat';
  import { SEPARATOR, type MenuEntry, type MenuItem } from '../menu/menu';
  import type { ProcessInfo } from '../model/types';
  import { selectedTargets, type Selection } from '../process/columns';
  import {
    filterProcesses,
    groupProcesses,
    nextSort,
    sortBy,
    type ProcessGroup,
    type SortState,
  } from '../process/process';
  import {
    childText,
    groupName,
    groupText,
    groupUsage,
    groupValue,
    heatOf,
    kindLabel,
    PROCESS_COLUMNS,
    PROCESS_NUMERIC,
    processColumnLabel,
    processKind,
    processUsage,
    tableSections,
    toggleProcessColumn,
    type ProcessCellContext,
    type ProcessColumn,
  } from '../process/processColumns';
  import { REFRESH_OPTIONS } from '../settings/settings';
  import type { AppWindows } from '../state/appWindows.svelte';
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
    appWindows: AppWindows;
    query: string;
    /** 「詳細の表示に移動」で詳細タブを開く */
    ongotodetails?: (pid: number) => void;
  }

  const { monitor, settings, icons, menus, processActions, appWindows, query, ongotodetails }: Props =
    $props();

  /** ウィンドウの一覧を読み直す間隔 */
  const WINDOWS_RELOAD_MS = 5000;

  let sort = $state<SortState<ProcessColumn>>({ key: 'cpu', direction: 'desc' });
  let selection = $state<Selection>(null);
  const expanded = new SvelteSet<string>();
  const sizer = untrack(() => new ColumnSizer(settings, 'processes'));

  const snapshot = $derived(monitor.snapshot);
  const columns = $derived(settings.value.processColumns);
  const grouped = $derived(settings.value.groupByType);
  const windows = $derived((monitor.systemInfo?.osName ?? 'Windows').toLowerCase().includes('windows'));
  const memoryTotal = $derived(snapshot?.memory.total ?? 0);
  const ctx: ProcessCellContext = $derived({
    kind: (g: ProcessGroup) => processKind(g, appWindows.pids, windows),
    windows,
    description: (exe: string) => icons.description(exe),
    company: (exe: string) => icons.company(exe),
    marks: (p: ProcessInfo) => processActions.marks(p),
    memoryTotal,
  });
  // 隠した列で並べていたら CPU の順に戻す
  const activeSort = $derived<SortState<ProcessColumn>>(
    columns.includes(sort.key) ? sort : { key: 'cpu', direction: 'desc' },
  );
  const groups = $derived(
    sortBy(groupProcesses(filterProcesses(snapshot?.processes ?? [], query)), activeSort, (g, key) =>
      groupValue(g, key, ctx),
    ),
  );
  const sections = $derived(tableSections(groups, grouped, ctx.kind));
  const totals = $derived<Partial<Record<ProcessColumn, string>>>({
    cpu: formatPercent(snapshot?.cpu.usage ?? 0, 0),
    memory: formatPercent(shareOf(snapshot?.memory.used ?? 0, memoryTotal), 0),
    disk: formatRate(
      (snapshot?.processes ?? []).reduce((sum, p) => sum + p.diskReadPerSec + p.diskWrittenPerSec, 0),
    ),
    gpu: formatPercent(Math.max(0, ...(snapshot?.gpus ?? []).map((g) => g.usage ?? 0)), 0),
  });
  const targets = $derived(selectedTargets(selection, groups));
  const chosen = $derived(
    groups.flatMap((g) => g.children).filter((p) => targets.some((t) => t.pid === p.pid)),
  );
  const colspan = $derived(columns.length + 1);

  // 種類分けや「種類」の列を出すときだけ、ウィンドウの一覧を読み直す
  $effect(() => {
    if (!grouped && !columns.includes('type')) return;
    void appWindows.refresh();
    const timer = setInterval(() => void appWindows.refresh(), WINDOWS_RELOAD_MS);
    return () => {
      clearInterval(timer);
    };
  });

  function onsort(key: ProcessColumn) {
    sort = nextSort(activeSort, key, PROCESS_NUMERIC);
  }

  function toggle(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
  }

  async function endTask() {
    if (chosen.length === 0) return;
    await processActions.end(chosen);
    selection = null;
  }

  function openColumnMenu(event: MouseEvent) {
    const entries = PROCESS_COLUMNS.map((c) => ({
      id: c.key,
      label: c.label,
      checked: columns.includes(c.key),
      disabled: c.key === 'name',
    }));
    menus.open(event, '列の選択', entries, (id) => {
      const column = PROCESS_COLUMNS.find((c) => c.key === id)?.key;
      if (column) settings.update({ processColumns: toggleProcessColumn(columns, column) });
    });
  }

  function openViewMenu(event: MouseEvent) {
    const entries: MenuEntry[] = [
      { id: 'refresh', label: '今すぐ最新の情報に更新', key: 'R' },
      {
        id: 'speed',
        label: 'リアルタイム更新の速度',
        key: 'U',
        children: REFRESH_OPTIONS.map((o) => ({
          id: `speed:${o.id}`,
          label: o.label,
          checked: settings.value.refresh === o.id,
        })),
      },
      SEPARATOR,
      { id: 'group', label: '種類別にグループ化', key: 'G', checked: grouped },
      { id: 'expand', label: 'すべて展開', key: 'E' },
      { id: 'collapse', label: 'すべて折りたたむ', key: 'C' },
    ];
    menus.open(event, '表示', entries, (id) => {
      const speed = REFRESH_OPTIONS.find((o) => `speed:${o.id}` === id);
      if (speed) settings.update({ refresh: speed.id });
      else if (id === 'refresh') void monitor.refresh();
      else if (id === 'group') settings.update({ groupByType: !grouped });
      else if (id === 'expand') {
        for (const g of groups) if (g.children.length > 1) expanded.add(g.key);
      } else if (id === 'collapse') expanded.clear();
    });
  }

  /** エクスプローラーだけは本家と同じく「再起動」を出す */
  const isExplorer = (p: ProcessInfo | undefined) => p?.name.toLowerCase() === 'explorer.exe';

  /**
   * 行の右クリック。1 つのプロセスの行は詳細タブと同じメニュー（優先度なども選べる）。
   * 複数のプロセスをまとめた行は、まとめて扱えるものだけを出す。
   */
  function openMenu(event: MouseEvent, group: ProcessGroup, child: ProcessInfo | null) {
    selection = child ? { kind: 'process', pid: child.pid } : { kind: 'group', key: group.key };
    const representative = child ?? group.children[0];
    if (!representative) return;
    const multi = child === null && group.children.length > 1;
    const windowPid = (child ? [child] : group.children).find((p) => appWindows.pids.has(p.pid))?.pid;
    const toggleItem: MenuItem = {
      id: 'toggle',
      label: expanded.has(group.key) ? '折りたたむ' : '展開する',
      key: 'X',
    };
    const switchItem: MenuItem = { id: 'switch', label: '切り替え', key: 'S' };
    const restartItem: MenuItem = { id: 'restart', label: '再起動', key: 'R', disabled: processActions.busy };
    const detailsItem: MenuItem = {
      id: 'details',
      label: '詳細の表示に移動',
      key: 'D',
      disabled: !ongotodetails,
    };
    const onextra = (id: string) => {
      if (id === 'toggle') toggle(group.key);
      else if (id === 'details') ongotodetails?.(representative.pid);
      else if (id === 'switch' && windowPid !== undefined) void processActions.switchTo(windowPid);
      else if (id === 'restart') void processActions.restart(representative);
    };
    const onend = () => {
      void endTask();
    };
    if (!multi) {
      const before = [
        ...(windowPid === undefined ? [] : [switchItem]),
        ...(isExplorer(representative) ? [restartItem] : []),
      ];
      processActions.openMenu(event, representative, { before, middle: [detailsItem], onextra, onend });
      return;
    }
    const efficient = group.children.every((p) => processActions.marks(p).efficient);
    const entries: MenuEntry[] = [
      toggleItem,
      ...(windowPid === undefined ? [] : [switchItem]),
      SEPARATOR,
      { id: 'end', label: 'タスクの終了', key: 'E', disabled: processActions.busy },
      { id: 'efficiency', label: '効率モード', key: 'M', checked: efficient, disabled: processActions.busy },
      SEPARATOR,
      detailsItem,
      { id: 'reveal', label: 'ファイルの場所を開く', key: 'O', disabled: representative.exe === '' },
      { id: 'search', label: 'オンライン検索', key: 'N' },
    ];
    menus.open(event, 'プロセスの操作', entries, (id) => {
      if (id === 'end') onend();
      else if (id === 'efficiency') processActions.toggleEfficiency(group.children);
      else if (id === 'reveal') void processActions.reveal(representative.exe);
      else if (id === 'search') void processActions.search(group.name);
      else onextra(id);
    });
  }

  /** 開いた行の名前。ウィンドウがあればそのタイトル（本家と同じ）。 */
  function childLabel(p: ProcessInfo): string {
    const title = appWindows.titles.get(p.pid) ?? '';
    return title === '' ? childText(p, 'name', ctx) : title;
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
      disabled={chosen.length === 0 || processActions.busy}
      onclick={endTask}
    >
      <Icon name="endTask" />
      タスクを終了する
    </button>
    <button
      type="button"
      class="command"
      disabled={chosen.length === 0 || processActions.busy}
      onclick={() => {
        processActions.toggleEfficiency(chosen);
      }}
    >
      <Icon name="leaf" />
      効率モード
    </button>
    <button type="button" class="command" aria-haspopup="menu" onclick={openViewMenu}>
      <Icon name="view" />
      表示
    </button>
  {/snippet}
</PageHeader>

<div class="table-wrap" role="presentation" {onkeydown}>
  <table class="table resizable" aria-label="プロセス一覧" style:min-width="{sizer.total(columns)}px">
    <colgroup>
      {#each columns as column (column)}
        <col style:width="{sizer.width(column)}px" />
      {/each}
      <col />
    </colgroup>
    <thead>
      <tr oncontextmenu={openColumnMenu} title="右クリックで列を選べます">
        {#each columns as column (column)}
          <SortHeader
            key={column}
            label={processColumnLabel(column)}
            sort={activeSort}
            {onsort}
            align={PROCESS_NUMERIC.includes(column) ? 'right' : 'left'}
            summary={totals[column]}
            width={sizer.width(column)}
            onresize={(width: number | null, done: boolean) => {
              sizer.resize(column, width, done);
            }}
          />
        {/each}
        <th class="filler"></th>
      </tr>
    </thead>
    <tbody>
      {#each sections as section (section.kind ?? 'all')}
        {#if section.kind !== null}
          <tr class="section" data-testid="process-section">
            <td {colspan}>{kindLabel(section.kind, windows)} ({section.groups.length})</td>
          </tr>
        {/if}
        {#each section.groups as group (group.key)}
          {@const multi = group.children.length > 1}
          {@const isOpen = expanded.has(group.key)}
          {@const usage = groupUsage(group)}
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
            {#each columns as column (column)}
              {#if column === 'name'}
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
                    <span class="text">
                      {groupName(group, ctx)}{multi ? ` (${String(group.children.length)})` : ''}
                    </span>
                  </span>
                </td>
              {:else}
                <td
                  class="heat-{heatOf(column, usage, memoryTotal)}"
                  class:num={PROCESS_NUMERIC.includes(column)}
                  class:muted={column === 'status' || column === 'command'}
                >
                  {groupText(group, column, ctx)}
                </td>
              {/if}
            {/each}
            <td class="filler"></td>
          </tr>
          {#if multi && isOpen}
            {#each group.children as child (child.pid)}
              {@const childUsage = processUsage(child)}
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
                {#each columns as column (column)}
                  {#if column === 'name'}
                    <td>
                      <span class="name">
                        <ProcessIcon src={icons.get(child.exe)} />
                        <span class="text">
                          {childLabel(child)}
                        </span>
                      </span>
                    </td>
                  {:else}
                    <td
                      class="heat-{heatOf(column, childUsage, memoryTotal)}"
                      class:num={PROCESS_NUMERIC.includes(column)}
                      class:muted={column === 'status' || column === 'command'}
                    >
                      {childText(child, column, ctx)}
                    </td>
                  {/if}
                {/each}
                <td class="filler"></td>
              </tr>
            {/each}
          {/if}
        {/each}
      {:else}
        <tr>
          <td {colspan} class="empty">読み込み中…</td>
        </tr>
      {/each}
      {#if snapshot && groups.length === 0}
        <tr>
          <td {colspan} class="empty">該当するプロセスはありません</td>
        </tr>
      {/if}
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
  .muted {
    color: var(--text-muted);
  }
  .section td {
    padding-top: 12px;
    font-weight: 600;
  }
  .table tbody tr.section:hover {
    background: transparent;
  }
</style>
