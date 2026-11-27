<script lang="ts">
  interface Props {
    /** 今の幅（px） */
    width: number;
    /** 列の名前（読み上げ用） */
    label: string;
    /** 幅を変えた。`null` は最初の幅に戻す。`done` はつかみ終えたか（保存してよいか） */
    onresize: (width: number | null, done: boolean) => void;
    /** つまみを置く側。左側なら、左へ動かすと広がる（右に置いた横の欄など） */
    edge?: 'left' | 'right';
  }

  const { width, label, onresize, edge = 'right' }: Props = $props();

  const KEY_STEP = 10;
  let start: { x: number; width: number } | null = null;
  const sign = $derived(edge === 'left' ? -1 : 1);

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    start = { x: event.clientX, width };
  }

  function onpointermove(event: PointerEvent) {
    if (start) onresize(start.width + sign * (event.clientX - start.x), false);
  }

  function onpointerup(event: PointerEvent) {
    if (!start) return;
    onresize(start.width + sign * (event.clientX - start.x), true);
    start = null;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onresize(width + sign * (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP), true);
  }
</script>

<!-- 見出しの右端。ドラッグで幅を変え、ダブルクリックで最初の幅に戻す -->
<button
  type="button"
  class="resize"
  class:left={edge === 'left'}
  aria-label="{label} の幅を変える"
  title="ドラッグで幅を変更（ダブルクリックで元に戻す）"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  {onkeydown}
  onclick={(e) => {
    e.stopPropagation();
  }}
  ondblclick={(e) => {
    e.stopPropagation();
    onresize(null, true);
  }}
></button>

<style>
  .resize {
    padding: 0;
    border: none;
    background: transparent;
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    touch-action: none;
  }
  .resize::after {
    content: '';
    position: absolute;
    top: 20%;
    right: 0;
    width: 1px;
    height: 60%;
    background: var(--border);
  }
  .resize:hover::after,
  .resize:focus-visible::after {
    width: 2px;
    background: var(--accent);
  }
  .resize:focus-visible {
    outline: none;
  }
  .resize.left {
    right: auto;
    left: 0;
  }
  .resize.left::after {
    right: auto;
    left: 0;
  }
</style>
