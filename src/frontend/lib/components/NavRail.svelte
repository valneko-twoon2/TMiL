<script lang="ts">
  import type { Page } from '../settings/settings';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    page: Page;
    expanded: boolean;
    onnavigate: (page: Page) => void;
    ontoggle: () => void;
  }

  const { page, expanded, onnavigate, ontoggle }: Props = $props();

  const main: { id: Page; label: string; icon: IconName }[] = [
    { id: 'processes', label: 'プロセス', icon: 'processes' },
    { id: 'performance', label: 'パフォーマンス', icon: 'performance' },
    { id: 'startup', label: 'スタートアップ アプリ', icon: 'startup' },
    { id: 'details', label: '詳細', icon: 'details' },
  ];
</script>

<nav class="rail" class:expanded aria-label="ページ">
  <button
    type="button"
    class="item toggle"
    onclick={ontoggle}
    aria-label="ナビゲーションを開閉"
    aria-expanded={expanded}
  >
    <Icon name="menu" size={18} />
  </button>
  {#each main as item (item.id)}
    <button
      type="button"
      class="item"
      class:active={page === item.id}
      aria-current={page === item.id ? 'page' : undefined}
      title={item.label}
      onclick={() => {
        onnavigate(item.id);
      }}
    >
      <Icon name={item.icon} size={18} />
      <span class="label">{item.label}</span>
    </button>
  {/each}
  <div class="spacer"></div>
  <button
    type="button"
    class="item"
    class:active={page === 'settings'}
    aria-current={page === 'settings' ? 'page' : undefined}
    title="設定"
    onclick={() => {
      onnavigate('settings');
    }}
  >
    <Icon name="settings" size={18} />
    <span class="label">設定</span>
  </button>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 48px;
    padding: 4px;
    background: var(--bg);
    transition: width 0.15s ease;
    overflow: hidden;
  }
  .rail.expanded {
    width: 220px;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 36px;
    padding: 0 11px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .item:hover {
    background: var(--hover);
  }
  .item.active {
    background: var(--selected);
  }
  .item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .label {
    opacity: 0;
    transition: opacity 0.1s;
  }
  .expanded .label {
    opacity: 1;
  }
  .spacer {
    flex: 1;
  }
</style>
