<script lang="ts">
  // 見出しを押すと開閉できるまとまり（リソース モニターの表に使う）。
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** 見出しの右に出す要約（使用率など） */
    summary?: string;
    children: Snippet;
    testid?: string;
  }

  const { title, summary = '', children, testid }: Props = $props();
  let open = $state(true);
</script>

<section class="panel" data-testid={testid}>
  <button type="button" class="head" aria-expanded={open} onclick={() => (open = !open)}>
    <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
    <span class="title">{title}</span>
    <span class="summary">{summary}</span>
  </button>
  {#if open}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 20px 4px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .head:hover {
    background: var(--hover);
  }
  .title {
    font-weight: 600;
  }
  .summary {
    margin-left: auto;
    color: var(--text-muted);
  }
  .body {
    display: flex;
    flex-direction: column;
    height: 210px;
  }
</style>
