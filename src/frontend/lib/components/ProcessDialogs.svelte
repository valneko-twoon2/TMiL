<script lang="ts" module>
  // スニペットの中では props の名前と重なるため、操作は関数を通して呼ぶ
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { formatBytes, formatDateTime, formatPercent, formatUptime } from '../format/format';
  import { processStateLabel } from '../format/labels';
  import type { ProcessActions } from '../state/processActions.svelte';
  import Dialog from './Dialog.svelte';

  interface Props {
    actions: ProcessActions;
  }

  const { actions }: Props = $props();

  const dialog = $derived(actions.dialog);
  /** 関係の設定で選んでいる CPU */
  const chosen = new SvelteSet<number>();

  // 今の設定を読み終えたら、選んでいる CPU をそれに合わせる
  // （ダイアログが変わったときだけ動かし、選んでいる CPU の変化では動かさない）
  $effect(() => {
    const current = dialog;
    untrack(() => {
      chosen.clear();
      if (current?.kind === 'affinity' && current.cpus) for (const cpu of current.cpus) chosen.add(cpu);
    });
  });

  function toggleAll(cores: number, on: boolean) {
    chosen.clear();
    if (on) for (let i = 0; i < cores; i += 1) chosen.add(i);
  }

  function toggle(cpu: number, on: boolean) {
    if (on) chosen.add(cpu);
    else chosen.delete(cpu);
  }

  const close = () => {
    actions.close();
  };
</script>

{#if dialog?.kind === 'tree'}
  <Dialog title="{dialog.root.name} のプロセス ツリーを終了しますか?" onclose={close}>
    <p>
      このプロセスと、そこから起動されたプロセス（合わせて {dialog.members.length} 個）を終了します。 保存されていないデータは失われます。
    </p>
    <ul class="members" aria-label="終了するプロセス">
      {#each dialog.members as p (p.pid)}
        <li>{p.name}（{p.pid}）</li>
      {/each}
    </ul>
    {#snippet buttons()}
      <button
        type="button"
        class="primary"
        onclick={() => {
          void actions.endTree();
        }}
      >
        プロセス ツリーの終了
      </button>
      <button type="button" onclick={close}>キャンセル</button>
    {/snippet}
  </Dialog>
{:else if dialog?.kind === 'affinity'}
  {@const cores = dialog.cores}
  <Dialog title="プロセッサの関係" onclose={close}>
    <p>{dialog.process.name}（{dialog.process.pid}）の実行を許可するプロセッサを選んでください。</p>
    {#if dialog.cpus === null}
      <p class="muted">読み込み中…</p>
    {:else}
      <label class="cpu all">
        <input
          type="checkbox"
          checked={chosen.size === cores}
          indeterminate={chosen.size > 0 && chosen.size < cores}
          onchange={(e) => {
            toggleAll(cores, e.currentTarget.checked);
          }}
        />
        &lt;すべてのプロセッサ&gt;
      </label>
      <div class="cpus">
        {#each Array.from({ length: cores }, (_, i) => i) as cpu (cpu)}
          <label class="cpu">
            <input
              type="checkbox"
              checked={chosen.has(cpu)}
              onchange={(e) => {
                toggle(cpu, e.currentTarget.checked);
              }}
            />
            CPU {cpu}
          </label>
        {/each}
      </div>
    {/if}
    {#snippet buttons()}
      <button
        type="button"
        class="primary"
        disabled={chosen.size === 0}
        onclick={() => {
          void actions.applyAffinity([...chosen].sort((a, b) => a - b));
        }}
      >
        OK
      </button>
      <button type="button" onclick={close}>キャンセル</button>
    {/snippet}
  </Dialog>
{:else if dialog?.kind === 'properties'}
  {@const p = dialog.process}
  <Dialog title="{p.name} のプロパティ" onclose={close}>
    <dl class="properties">
      <dt>名前</dt>
      <dd>{p.name}</dd>
      <dt>PID</dt>
      <dd>{p.pid}</dd>
      <dt>親 PID</dt>
      <dd>{p.parentPid ?? '—'}</dd>
      <dt>状態</dt>
      <dd>{processStateLabel(p.state)}</dd>
      <dt>ユーザー名</dt>
      <dd>{p.user || '—'}</dd>
      <dt>CPU</dt>
      <dd>{formatPercent(p.cpu)}</dd>
      <dt>メモリ</dt>
      <dd>{formatBytes(p.memory)}</dd>
      <dt>開始時刻</dt>
      <dd>{formatDateTime(p.startTime) || '—'}</dd>
      <dt>稼働時間</dt>
      <dd>{formatUptime(p.runTimeSecs)}</dd>
      <dt>イメージ パス名</dt>
      <dd class="wrap">{p.exe || '—'}</dd>
      <dt>コマンドライン</dt>
      <dd class="wrap">{p.command || '—'}</dd>
    </dl>
    {#snippet buttons()}
      <button
        type="button"
        disabled={p.exe === ''}
        onclick={() => {
          void actions.reveal(p.exe);
        }}
      >
        ファイルの場所を開く
      </button>
      <button type="button" class="primary" onclick={close}>閉じる</button>
    {/snippet}
  </Dialog>
{/if}

<style>
  p {
    margin: 0 0 8px;
  }
  .muted {
    color: var(--text-muted);
  }
  .members {
    max-height: 160px;
    margin: 8px 0 0;
    padding-left: 20px;
    overflow: auto;
    color: var(--text-muted);
  }
  .cpus {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px 12px;
    margin-top: 4px;
  }
  .cpu {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cpu.all {
    margin-top: 8px;
  }
  .properties {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 0;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
  }
  .wrap {
    word-break: break-all;
  }
</style>
