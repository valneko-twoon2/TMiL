<script lang="ts">
  import type { RunTask } from '../state/runTask.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    runTask: RunTask;
  }

  const { runTask }: Props = $props();
  const close = () => {
    runTask.close();
  };
</script>

{#if runTask.open}
  <Dialog title="新しいタスクの実行" onclose={close}>
    <p>開くプログラム、フォルダー、ドキュメント、またはインターネット リソースの名前を入力してください。</p>
    <form
      id="run-task-form"
      onsubmit={(e) => {
        e.preventDefault();
        void runTask.submit();
      }}
    >
      <label class="field">
        名前
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={runTask.command} autofocus spellcheck="false" />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={runTask.admin} />
        このタスクに管理者特権を付与して作成します。
      </label>
    </form>
    {#if runTask.error}
      <p class="error" role="alert">{runTask.error}</p>
    {/if}
    {#snippet buttons()}
      <button
        type="submit"
        form="run-task-form"
        class="primary"
        disabled={runTask.busy || runTask.command.trim() === ''}
      >
        OK
      </button>
      <button type="button" onclick={close}>キャンセル</button>
    {/snippet}
  </Dialog>
{/if}

<style>
  p {
    margin: 0 0 10px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .field input {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .error {
    margin: 10px 0 0;
    color: var(--danger);
  }
</style>
