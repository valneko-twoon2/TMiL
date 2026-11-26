<script lang="ts" generics="K extends string">
  import type { SortState } from '../process/process';
  import ResizeHandle from './ResizeHandle.svelte';

  interface Props {
    key: K;
    label: string;
    sort: SortState<K>;
    onsort: (key: K) => void;
    align?: 'left' | 'right';
    /** 見出しの上に出す合計値（CPU 使用率など） */
    summary?: string;
    /** 列の幅（px）。指定すると右端をドラッグして変えられる */
    width?: number;
    onresize?: (width: number | null, done: boolean) => void;
  }

  const { key, label, sort, onsort, align = 'left', summary, width, onresize }: Props = $props();
  const active = $derived(sort.key === key);
</script>

<th
  class:right={align === 'right'}
  style:width={width === undefined ? undefined : `${String(width)}px`}
  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
>
  <button
    type="button"
    onclick={() => {
      onsort(key);
    }}
  >
    {#if summary !== undefined}
      <span class="summary">{summary}</span>
    {/if}
    <span class="label">
      {label}
      {#if active}<span class="arrow">{sort.direction === 'asc' ? '▲' : '▼'}</span>{/if}
    </span>
  </button>
  {#if width !== undefined && onresize}
    <ResizeHandle {width} {label} {onresize} />
  {/if}
</th>

<style>
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-weight: normal;
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }
  .right button {
    align-items: flex-end;
  }
  button:hover {
    background: var(--hover);
  }
  .summary {
    color: var(--text);
    font-size: 1.15em;
  }
  .arrow {
    font-size: 0.7em;
    margin-left: 4px;
  }
</style>
