<script lang="ts" generics="T">
  // 並べ替え・列の幅・選択・右クリックができる表。サービス・ユーザー・アプリの履歴・リソース モニターで使う。
  import { untrack } from 'svelte';
  import { nextSort, type SortState } from '../process/process';
  import { ColumnSizer } from '../state/columnSizer.svelte';
  import { ProgressiveRows } from '../state/progressiveRows.svelte';
  import type { SettingsStore } from '../state/settings.svelte';
  import {
    activeSort,
    cellText,
    defaultWidths,
    numericKeys,
    sortRowsPinned,
    type TableColumn,
  } from '../table/table';
  import ProcessIcon from './ProcessIcon.svelte';
  import SortHeader from './SortHeader.svelte';

  interface Props {
    /** 表の名前（読み上げ用） */
    label: string;
    /** 列の幅を保存するときの名前（英小文字だけ） */
    table: string;
    columns: readonly TableColumn<T>[];
    rows: readonly T[];
    rowKey: (row: T) => string;
    settings: SettingsStore;
    /** 最初の並び順 */
    initialSort?: SortState<string>;
    /** 選んでいる行の鍵（選び直すと onselect で知らせる） */
    selected?: string | null;
    onselect?: (key: string, row: T) => void;
    /** 行が無いときの文 */
    empty?: string;
    /** 見出しの上に出す合計など（列の鍵 → 文字） */
    summaries?: Record<string, string>;
    /** 行の先頭のチェックボックス（リソース モニターの絞り込み） */
    checked?: (row: T) => boolean;
    oncheck?: (row: T, on: boolean) => void;
    oncontextmenu?: (event: MouseEvent, row: T) => void;
    onheadercontextmenu?: (event: MouseEvent) => void;
    /** 選んだ行で Delete を押したとき */
    ondelete?: (row: T) => void;
    testid?: string;
    /** 表が見える高さ（px）。最初に描く行の数を決める。省くとウィンドウの高さ */
    viewportHeight?: number;
  }

  const {
    label,
    table,
    columns,
    rows,
    rowKey,
    settings,
    initialSort,
    selected = null,
    onselect,
    empty = '該当する項目はありません',
    summaries = {},
    checked,
    oncheck,
    oncontextmenu,
    onheadercontextmenu,
    ondelete,
    testid,
    viewportHeight,
  }: Props = $props();

  let sort = $state<SortState<string>>(
    untrack(() => initialSort ?? { key: columns[0]?.key ?? '', direction: 'asc' }),
  );
  const sizer = untrack(() => new ColumnSizer(settings, table, defaultWidths(columns)));

  const current = $derived(activeSort(columns, sort));
  // チェックした行は上にまとめる（本家のリソース モニターと同じ）
  const sorted = $derived(sortRowsPinned(rows, columns, current, checked));
  // 画面を開いたときは見える分だけ先に描き、残りは次のフレームから足す
  const progressive = untrack(() => new ProgressiveRows(() => sorted.length, viewportHeight));
  const shown = $derived(progressive.take(sorted));
  const numeric = $derived(numericKeys(columns));
  const keys = $derived(columns.map((c) => c.key));
  const checkWidth = $derived(checked ? 32 : 0);

  function onsort(key: string) {
    sort = nextSort(current, key, numeric);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Delete' || !ondelete || selected === null) return;
    const row = sorted.find((r) => rowKey(r) === selected);
    if (row !== undefined) ondelete(row);
  }
</script>

<div class="table-wrap" role="presentation" {onkeydown} data-testid={testid}>
  <table class="table resizable" aria-label={label} style:min-width="{sizer.total(keys) + checkWidth}px">
    <colgroup>
      {#if checked}<col style:width="32px" />{/if}
      {#each columns as column (column.key)}
        <col style:width="{sizer.width(column.key)}px" />
      {/each}
      <col />
    </colgroup>
    <thead>
      <tr oncontextmenu={onheadercontextmenu}>
        {#if checked}<th class="check-head" aria-label="選択"></th>{/if}
        {#each columns as column (column.key)}
          <SortHeader
            key={column.key}
            label={column.label}
            sort={current}
            {onsort}
            align={column.numeric ? 'right' : 'left'}
            summary={summaries[column.key]}
            width={sizer.width(column.key)}
            onresize={(width: number | null, done: boolean) => {
              sizer.resize(column.key, width, done);
            }}
          />
        {/each}
        <th class="filler"></th>
      </tr>
    </thead>
    <tbody>
      {#each shown as row (rowKey(row))}
        {@const key = rowKey(row)}
        <tr
          class:selected={selected === key}
          tabindex="0"
          onclick={() => onselect?.(key, row)}
          onkeydown={(e) => {
            if (e.key === 'Enter') onselect?.(key, row);
          }}
          oncontextmenu={(e) => {
            onselect?.(key, row);
            oncontextmenu?.(e, row);
          }}
          data-key={key}
        >
          {#if checked}
            <td class="check">
              <input
                type="checkbox"
                aria-label="{cellText(columns[0] ?? { key: '', label: '', value: () => key }, row)} を選ぶ"
                checked={checked(row)}
                onclick={(e) => {
                  e.stopPropagation();
                }}
                onchange={(e) => {
                  oncheck?.(row, e.currentTarget.checked);
                }}
              />
            </td>
          {/if}
          {#each columns as column (column.key)}
            {@const text = cellText(column, row)}
            <td
              class="heat-{column.heat?.(row) ?? 0}"
              class:num={column.numeric}
              class:muted={column.muted}
              title={column.muted ? text : undefined}
            >
              {#if column.icon}
                <span class="name">
                  <ProcessIcon src={column.icon(row)} />
                  <span class="text">{text}</span>
                </span>
              {:else}
                {text}
              {/if}
            </td>
          {/each}
          <td class="filler"></td>
        </tr>
      {:else}
        <tr>
          <td colspan={columns.length + (checked ? 2 : 1)} class="empty">{empty}</td>
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
  .muted {
    color: var(--text-muted);
  }
  .check {
    padding: 0 8px;
  }
  .check input {
    margin: 0;
  }
  .check-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
</style>
