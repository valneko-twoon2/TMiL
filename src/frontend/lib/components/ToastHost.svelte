<script lang="ts">
  import type { Toasts } from '../state/toast.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    toasts: Toasts;
  }

  const { toasts }: Props = $props();
</script>

<div class="host" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div
      class="toast"
      class:error={toast.kind === 'error'}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.text}</span>
      <button
        type="button"
        aria-label="閉じる"
        onclick={() => {
          toasts.dismiss(toast.id);
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .host {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 420px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  button {
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
</style>
