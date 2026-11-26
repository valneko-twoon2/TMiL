<script lang="ts">
  import { tick } from 'svelte';
  import { isItem, menuPosition, nextIndex } from '../menu/menu';
  import type { ContextMenus } from '../state/menus.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    menus: ContextMenus;
  }

  const { menus }: Props = $props();

  let element = $state<HTMLDivElement | null>(null);
  let position = $state({ left: 0, top: 0 });
  let active = $state(-1);

  const menu = $derived(menus.current);

  // 開いたら画面に収まる位置に置き、最初の項目に移る
  $effect(() => {
    const current = menu;
    if (!current) return;
    active = nextIndex(current.entries, -1, 1);
    void tick().then(() => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      position = menuPosition(
        current.x,
        current.y,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      element.querySelector<HTMLElement>(`[data-index="${String(active)}"]`)?.focus();
    });
  });

  // 外を押す・スクロール・ウィンドウの切り替えで閉じる
  $effect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && element?.contains(event.target)) return;
      menus.close();
    };
    const options = { capture: true };
    window.addEventListener('pointerdown', close, options);
    window.addEventListener('scroll', close, options);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, options);
      window.removeEventListener('scroll', close, options);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  });

  function focusItem(index: number) {
    active = index;
    element?.querySelector<HTMLElement>(`[data-index="${String(index)}"]`)?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (!menu) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      menus.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(nextIndex(menu.entries, active, event.key === 'ArrowDown' ? 1 : -1));
    }
  }
</script>

{#if menu}
  <div
    bind:this={element}
    class="menu"
    role="menu"
    tabindex="-1"
    aria-label={menu.label}
    style:left="{position.left}px"
    style:top="{position.top}px"
    {onkeydown}
    oncontextmenu={(e) => {
      e.preventDefault();
    }}
  >
    {#each menu.entries as entry, i (i)}
      {#if isItem(entry)}
        <button
          type="button"
          class="item"
          role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-checked={entry.checked}
          disabled={entry.disabled}
          tabindex={i === active ? 0 : -1}
          data-index={i}
          onclick={() => {
            menus.select(entry.id);
          }}
        >
          <span class="check">
            {#if entry.checked}<Icon name="enable" size={14} />{/if}
          </span>
          {entry.label}
        </button>
      {:else}
        <div class="separator" role="separator"></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px 6px 6px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: default;
  }
  .item:hover:not(:disabled),
  .item:focus-visible {
    outline: none;
    background: var(--hover);
  }
  .item:disabled {
    color: var(--text-muted);
    opacity: 0.6;
  }
  .check {
    display: inline-flex;
    width: 16px;
    justify-content: center;
    color: var(--accent);
  }
  .separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>
