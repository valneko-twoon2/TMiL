<script lang="ts">
  import { tick } from 'svelte';
  import {
    indexForKey,
    isItem,
    itemLabel,
    menuPosition,
    nextIndex,
    type MenuEntry,
    type MenuItem,
  } from '../menu/menu';
  import type { ContextMenus } from '../state/menus.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    menus: ContextMenus;
  }

  const { menus }: Props = $props();

  let element = $state<HTMLDivElement | null>(null);
  let subElement = $state<HTMLDivElement | null>(null);
  let position = $state({ left: 0, top: 0 });
  let subPosition = $state({ left: 0, top: 0 });
  let active = $state(-1);
  let openSub = $state(-1);
  let subActive = $state(-1);

  const menu = $derived(menus.current);
  const subEntries = $derived.by<MenuEntry[]>(() => {
    const parent = menu?.entries[openSub];
    return parent && isItem(parent) ? (parent.children ?? []) : [];
  });

  const view = () => ({ width: window.innerWidth, height: window.innerHeight });
  const sizeOf = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };
  const focusIn = (root: HTMLElement | null, index: number) => {
    root?.querySelector<HTMLElement>(`[data-index="${String(index)}"]`)?.focus();
  };

  let openedAt: { x: number; y: number } | null = null;
  $effect(() => {
    const current = menu;
    if (!current) {
      openedAt = null;
      return;
    }
    if (openedAt?.x === current.x && openedAt.y === current.y) return;
    openedAt = { x: current.x, y: current.y };
    openSub = -1;
    active = nextIndex(current.entries, -1, 1);
    void tick().then(() => {
      if (!element) return;
      position = menuPosition(current.x, current.y, sizeOf(element), view());
      focusIn(element, active);
    });
  });

  $effect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (element?.contains(target) || subElement?.contains(target))) return;
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

  function showSub(index: number, focus: boolean) {
    openSub = index;
    subActive = focus ? nextIndex(subEntries, -1, 1) : -1;
    void tick().then(() => {
      const parent = element?.querySelector<HTMLElement>(`[data-index="${String(index)}"]`);
      if (!parent || !subElement) return;
      const rect = parent.getBoundingClientRect();
      const size = sizeOf(subElement);
      const placed = menuPosition(rect.right, rect.top, size, view());
      subPosition =
        rect.right + size.width > window.innerWidth
          ? { ...placed, left: Math.max(4, rect.left - size.width) }
          : placed;
      if (focus) focusIn(subElement, subActive);
    });
  }

  function choose(item: MenuItem, index: number, focus: boolean) {
    if (item.disabled === true) return;
    if (item.children) showSub(index, focus);
    else menus.select(item.id);
  }

  const inSub = () => openSub >= 0 && subActive >= 0;

  function move(step: 1 | -1) {
    if (!menu) return;
    if (inSub()) {
      subActive = nextIndex(subEntries, subActive, step);
      focusIn(subElement, subActive);
    } else {
      active = nextIndex(menu.entries, active, step);
      openSub = -1;
      focusIn(element, active);
    }
  }

  function back(close: boolean) {
    if (inSub()) {
      openSub = -1;
      focusIn(element, active);
    } else if (close) {
      menus.close();
    }
  }

  function forward() {
    const entry = menu?.entries[active];
    if (!inSub() && entry && isItem(entry) && entry.children) showSub(active, true);
  }

  function accessKey(key: string): boolean {
    if (!menu) return false;
    const sub = inSub();
    const entries = sub ? subEntries : menu.entries;
    const index = indexForKey(entries, key);
    const entry = entries[index];
    if (!entry || !isItem(entry)) return false;
    if (sub) menus.select(entry.id);
    else {
      active = index;
      choose(entry, index, true);
    }
    return true;
  }

  const KEYS: Record<string, () => void> = {
    Escape: () => {
      back(true);
    },
    ArrowLeft: () => {
      back(false);
    },
    ArrowRight: forward,
    ArrowDown: () => {
      move(1);
    },
    ArrowUp: () => {
      move(-1);
    },
    Tab: () => {
      menus.close();
    },
  };

  function onkeydown(event: KeyboardEvent) {
    const handler = KEYS[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    } else if (accessKey(event.key)) {
      event.preventDefault();
    }
  }
</script>

{#snippet items(entries: MenuEntry[], current: number, sub: boolean)}
  {#each entries as entry, i (i)}
    {#if isItem(entry)}
      <button
        type="button"
        class="item"
        class:open={!sub && openSub === i}
        role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={entry.checked}
        aria-haspopup={entry.children ? 'menu' : undefined}
        aria-expanded={entry.children ? !sub && openSub === i : undefined}
        disabled={entry.disabled}
        tabindex={i === current ? 0 : -1}
        data-index={i}
        onclick={() => {
          if (sub) menus.select(entry.id);
          else choose(entry, i, false);
        }}
        onpointerenter={() => {
          if (sub || entry.disabled === true) return;
          active = i;
          if (entry.children) showSub(i, false);
          else openSub = -1;
        }}
      >
        <span class="check">
          {#if entry.checked}<Icon name="enable" size={14} />{/if}
        </span>
        <span class="label">{itemLabel(entry)}</span>
        {#if entry.children}<Icon name="chevronRight" size={12} />{/if}
      </button>
    {:else}
      <div class="separator" role="separator"></div>
    {/if}
  {/each}
{/snippet}

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
    {@render items(menu.entries, active, false)}
  </div>
  {#if openSub >= 0 && subEntries.length > 0}
    {@const parent = menu.entries[openSub]}
    <div
      bind:this={subElement}
      class="menu"
      role="menu"
      tabindex="-1"
      aria-label={parent && isItem(parent) ? parent.label : ''}
      style:left="{subPosition.left}px"
      style:top="{subPosition.top}px"
      {onkeydown}
      oncontextmenu={(e) => {
        e.preventDefault();
      }}
    >
      {@render items(subEntries, subActive, true)}
    </div>
  {/if}
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
  .label {
    flex: 1;
  }
  .item:hover:not(:disabled),
  .item.open,
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
