<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProcessIcon from '../components/ProcessIcon.svelte';
  import SortHeader from '../components/SortHeader.svelte';
  import {
    DETAIL_COLUMNS,
    DETAIL_NUMERIC,
    detailLabel,
    detailText,
    detailValue,
    REQUIRED_DETAIL_COLUMN,
    toggleDetailColumn,
    type DetailColumn,
  } from '../process/columns';
  import { filterProcesses, nextSort, sortBy, type SortState } from '../process/process';
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
    /** 開いたときに選んでおくプロセス（プロセス タブの「詳細の表示に移動」） */
    focusPid?: number | null;
    /** 「サービスに移動」でサービス タブを開く */
    ongotoservices?: (pid: number) => void;
  }

  const {
    monitor,
    settings,
    icons,
    menus,
    processActions,
    query,
    focusPid = null,
    ongotoservices,
  }: Props = $props();
  const describe = (exe: string) => icons.description(exe);

  let sort = $state<SortState<DetailColumn>>({ key: 'name', direction: 'asc' });
  let selected = $state<number | null>(untrack(() => focusPid));
  const sizer = untrack(() => new ColumnSizer(settings, 'details'));

  const columns = $derived(settings.value.detailColumns);
  // 隠した列で並べていたら、名前の順に戻す
  const activeSort = $derived<SortState<DetailColumn>>(
    columns.includes(sort.key) ? sort : { key: REQUIRED_DETAIL_COLUMN, direction: 'asc' },
  );
  const rows = $derived(
    sortBy(filterProcesses(monitor.snapshot?.processes ?? [], query), activeSort, (p, key) =>
      detailValue(p, key, describe),
    ),
  );
  const target = $derived(rows.find((r) => r.pid === selected));

  // 「詳細の表示に移動」で来たときは、その行が見える位置まで動かす
  $effect(() => {
    if (focusPid === null || !untrack(() => target)) return;
    void tick().then(() => {
      document.querySelector(`[data-pid="${String(focusPid)}"]`)?.scrollIntoView({ block: 'center' });
    });
  });

  function onsort(key: DetailColumn) {
    sort = nextSort(activeSort, key, DETAIL_NUMERIC);
  }

  async function endTask() {
    if (target === undefined) return;
    await processActions.end([target]);
    selected = null;
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
</script>

<PageHeader title="詳細">
  {#snippet actions()}
    <button
      type="button"
      class="command"
      disabled={target === undefined || processActions.busy}
      onclick={endTask}
    >
      <Icon name="endTask" />
      タスクを終了する
    </button>
    <button
      type="button"
      class="command"
      disabled={target === undefined || processActions.busy}
      onclick={() => {
        if (target) processActions.toggleEfficiency([target]);
      }}
    >
      <Icon name="leaf" />
      効率モード
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
  <table class="table resizable" aria-label="プロセスの詳細" style:min-width="{sizer.total(columns)}px">
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
            label={detailLabel(column)}
            sort={activeSort}
            {onsort}
            align={DETAIL_NUMERIC.includes(column) ? 'right' : 'left'}
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
      {#each rows as p (p.pid)}
        <tr
          class:selected={selected === p.pid}
          tabindex="0"
          onclick={() => (selected = p.pid)}
          onkeydown={(e) => {
            if (e.key === 'Enter') selected = p.pid;
          }}
          oncontextmenu={(e) => {
            selected = p.pid;
            processActions.openMenu(e, p, {
              onend: () => {
                void endTask();
              },
              after: ongotoservices ? [{ id: 'services', label: 'サービスに移動', key: 'S' }] : [],
              onextra: (id) => {
                if (id === 'services') ongotoservices?.(p.pid);
              },
            });
          }}
          data-testid="detail-row"
          data-pid={p.pid}
        >
          {#each columns as column (column)}
            {#if column === 'name'}
              <td>
                <span class="name">
                  <ProcessIcon src={icons.get(p.exe)} />
                  <span class="text">{p.name}</span>
                </span>
              </td>
            {:else if column === 'command' || column === 'exe' || column === 'description'}
              {@const text = detailText(p, column, describe)}
              <td class="long" title={text}>{text}</td>
            {:else}
              <td class:num={DETAIL_NUMERIC.includes(column)}>{detailText(p, column)}</td>
            {/if}
          {/each}
          <td class="filler"></td>
        </tr>
      {:else}
        <tr>
          <td colspan={columns.length + 1} class="empty">
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
    min-width: 0;
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .long {
    color: var(--text-muted);
  }
</style>
