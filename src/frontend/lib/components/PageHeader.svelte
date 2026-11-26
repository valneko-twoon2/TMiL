<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    actions?: Snippet;
  }

  const { title, actions }: Props = $props();
</script>

<header class="page-header">
  <h1>{title}</h1>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 20px 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
</style>
