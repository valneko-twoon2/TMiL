<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
    buttons: Snippet;
  }

  const { title, onclose, children, buttons }: Props = $props();

  let element = $state<HTMLDialogElement | null>(null);

  // 開いたらモーダルにする（Escape で閉じる・後ろは操作できない）。サーバー描画では何もしない
  $effect(() => {
    if (element && !element.open) element.showModal();
  });
</script>

<dialog
  bind:this={element}
  class="dialog"
  aria-labelledby="dialog-title"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <h2 id="dialog-title">{title}</h2>
  <div class="body">
    {@render children()}
  </div>
  <div class="actions">
    {@render buttons()}
  </div>
</dialog>

<style>
  .dialog {
    min-width: 360px;
    max-width: min(560px, calc(100vw - 40px));
    padding: 20px 24px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
  }
  .dialog::backdrop {
    background: rgba(0, 0, 0, 0.3);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
    font-weight: 600;
  }
  .body {
    max-height: 60vh;
    overflow: auto;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
  .actions :global(button) {
    min-width: 96px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .actions :global(button.primary) {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }
  .actions :global(button:disabled) {
    opacity: 0.5;
  }
</style>
