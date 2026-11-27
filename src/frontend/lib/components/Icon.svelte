<script lang="ts" module>
  export const ICONS = {
    menu: 'M3 6h18M3 12h18M3 18h18',
    processes: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    performance: 'M3 13h4l2-6 4 12 3-9 2 3h3',
    startup: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
    details: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    settings:
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
    endTask: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
    chevronRight: 'M9 6l6 6-6 6',
    chevronDown: 'M6 9l6 6 6-6',
    enable: 'M5 12l5 5L20 7',
    disable: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    close: 'M6 6l12 12M18 6L6 18',
    app: 'M4 5h16v14H4zM4 9h16M7 7h.01',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    users:
      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4.5-6.5',
    services: 'M4 7h3a2 2 0 1 1 4 0h3v3a2 2 0 1 1 0 4v3h-3a2 2 0 1 0-4 0H4v-3a2 2 0 1 0 0-4z',
    resmon: 'M3 4h18v12H3zM8 20h8M12 16v4M6 11h3l2-3 2 5 2-2h3',
    run: 'M4 5h16v14H4zM4 9h16M10 12l4 2-4 2z',
    leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14zM5 19l7-7',
    view: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    play: 'M7 5l12 7-12 7z',
    stop: 'M7 7h10v10H7z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  } as const;

  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    label?: string;
  }

  const { name, size = 16, label }: Props = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <path d={ICONS[name]} />
</svg>

<style>
  .icon {
    flex: none;
  }
</style>
