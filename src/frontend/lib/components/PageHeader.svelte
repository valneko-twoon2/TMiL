<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useRunTask } from '../state/runTask.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    actions?: Snippet;
  }

  const { title, actions }: Props = $props();
  const runTask = useRunTask();
</script>

<header class="page-header">
  <h1>{title}</h1>
  {#if actions !== undefined || runTask !== undefined}
    <div class="actions">
      {#if runTask}
        <button
          type="button"
          class="command"
          onclick={() => {
            runTask.show();
          }}
        >
          <Icon name="run" />
          新しいタスクを実行する
        </button>
      {/if}
      {#if actions}{@render actions()}{/if}
    </div>
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
