<script lang="ts">
  import { onMount } from 'svelte';
  import type { Api } from '../api/ipc';
  import PageHeader from '../components/PageHeader.svelte';
  import type { ReplacementStatus } from '../model/types';
  import { PAGE_LABELS, PAGES, REFRESH_OPTIONS, THEME_OPTIONS } from '../settings/settings';
  import type { SettingsStore } from '../state/settings.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    settings: SettingsStore;
    api: Api;
    toasts: Toasts;
  }

  const { settings, api, toasts }: Props = $props();

  let replacement = $state<ReplacementStatus | null>(null);
  let busy = $state(false);

  const pageOptions = PAGES.filter((id) => id !== 'settings').map((id) => ({ id, label: PAGE_LABELS[id] }));

  async function toggleReplacement() {
    if (!replacement || busy) return;
    busy = true;
    try {
      replacement = await api.setTaskmgrReplacement(!replacement.replaced);
      toasts.show(
        replacement.replaced
          ? 'タスク マネージャーを Task Manager Lite に置き換えました。'
          : '元に戻しました。',
      );
    } catch (cause) {
      toasts.show(cause instanceof Error ? cause.message : String(cause), 'error');
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    api.taskmgrReplacement().then(
      (status) => (replacement = status),
      () => (replacement = null),
    );
  });
</script>

<PageHeader title="設定" />

<div class="settings">
  <section>
    <h2>既定のページ</h2>
    <select
      aria-label="既定のページ"
      value={settings.value.startPage}
      onchange={(e) => {
        const id = pageOptions.find((o) => o.id === e.currentTarget.value)?.id;
        if (id) settings.update({ startPage: id });
      }}
    >
      {#each pageOptions as o (o.id)}
        <option value={o.id}>{o.label}</option>
      {/each}
    </select>
  </section>

  <section>
    <h2>リアルタイム更新の速度</h2>
    <div class="options" role="radiogroup" aria-label="リアルタイム更新の速度">
      {#each REFRESH_OPTIONS as o (o.id)}
        <label>
          <input
            type="radio"
            name="refresh"
            value={o.id}
            checked={settings.value.refresh === o.id}
            onchange={() => {
              settings.update({ refresh: o.id });
            }}
          />
          {o.label}{o.intervalMs > 0 ? `（${String(o.intervalMs / 1000)} 秒）` : ''}
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h2>テーマ</h2>
    <div class="options" role="radiogroup" aria-label="テーマ">
      {#each THEME_OPTIONS as o (o.id)}
        <label>
          <input
            type="radio"
            name="theme"
            value={o.id}
            checked={settings.value.theme === o.id}
            onchange={() => {
              settings.update({ theme: o.id });
            }}
          />
          {o.label}
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h2>ウィンドウの管理</h2>
    <label>
      <input
        type="checkbox"
        checked={settings.value.alwaysOnTop}
        onchange={(e) => {
          settings.update({ alwaysOnTop: e.currentTarget.checked });
        }}
      />
      常に手前に表示
    </label>
  </section>

  <section>
    <h2>その他のオプション</h2>
    <label>
      <input
        type="checkbox"
        checked={settings.value.confirmEfficiency}
        onchange={(e) => {
          settings.update({ confirmEfficiency: e.currentTarget.checked });
        }}
      />
      効率モードを適用する前に確認する
    </label>
  </section>

  {#if replacement?.supported}
    <section>
      <h2>Windows のタスク マネージャーを置き換える</h2>
      <p class="note">
        タスクバーの右クリックメニューや Ctrl+Shift+Esc で Task Manager Lite
        が開くようになります。切り替えには管理者の確認が出ます。 Task Manager Lite
        をインストーラーでアンインストールすると、自動で元に戻ります。
      </p>
      {#if replacement.other}
        <p class="note warn">別のアプリ（{replacement.other}）に置き換えられています。</p>
      {/if}
      <button type="button" class="command outline" disabled={busy} onclick={toggleReplacement}>
        {replacement.replaced ? '元に戻す' : 'Task Manager Lite に置き換える'}
      </button>
      <span class="state">現在: {replacement.replaced ? '置き換え中' : '置き換えていません'}</span>
    </section>
  {/if}

  <section>
    <h2>バージョン情報</h2>
    <p>Task Manager Lite v{import.meta.env.VITE_APP_VERSION}</p>
  </section>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 20px 20px;
    overflow-y: auto;
  }
  section {
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--surface);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1rem;
    font-weight: 600;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  select {
    min-width: 220px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
  }
  .note {
    margin: 0 0 8px;
    color: var(--text-muted);
  }
  .warn {
    color: var(--danger);
  }
  .state {
    margin-left: 12px;
    color: var(--text-muted);
  }
  p {
    margin: 0;
  }
</style>
