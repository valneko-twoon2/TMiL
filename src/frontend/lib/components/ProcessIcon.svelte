<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    /** 画像の data URL。無い・まだ分からないときは決まった絵を出す */
    src: string | null | undefined;
    size?: number;
  }

  const { src, size = 16 }: Props = $props();
</script>

{#if src}
  <img class="process-icon" {src} alt="" width={size} height={size} draggable="false" />
{:else}
  <span class="process-icon fallback"><Icon name="app" {size} /></span>
{/if}

<style>
  .process-icon {
    flex: none;
    object-fit: contain;
  }
  .fallback {
    display: inline-flex;
    color: var(--text-muted);
  }
</style>
