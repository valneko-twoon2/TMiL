<script lang="ts">
  import LineChart from '../components/LineChart.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { shareOf } from '../format/heat';
  import { historyKey } from '../history/history';
  import { SEPARATOR, type MenuEntry } from '../menu/menu';
  import {
    buildResources,
    historySpanLabel,
    memoryParts,
    RESOURCE_COLORS,
    resourceStats,
    statsText,
  } from '../performance/resources';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { Toasts } from '../state/toast.svelte';

  interface Props {
    monitor: Monitor;
    intervalMs: number;
    menus?: ContextMenus;
    toasts?: Toasts;
    onopenresmon?: () => void;
  }

  const { monitor, intervalMs, menus, toasts, onopenresmon }: Props = $props();
  let selectedId = $state('cpu');
  let perCore = $state(false);
  let summary = $state(false);

  const resources = $derived(
    monitor.snapshot ? buildResources(monitor.snapshot, monitor.history, monitor.systemInfo) : [],
  );
  const current = $derived(resources.find((r) => r.id === selectedId) ?? resources[0]);
  const stats = $derived(
    current && monitor.snapshot ? resourceStats(current, monitor.snapshot, monitor.systemInfo) : [],
  );
  const cores = $derived(monitor.snapshot?.cpu.perCore ?? []);
  const memory = $derived(monitor.snapshot?.memory);

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(statsText(current, stats));
      toasts?.show('コピーしました。');
    } catch {
      toasts?.show('コピーできませんでした。', 'error');
    }
  }

  function openMenu(event: MouseEvent) {
    if (!menus || !current) return;
    const entries: MenuEntry[] = [
      ...(current.kind === 'cpu'
        ? [
            {
              id: 'graph',
              label: 'グラフの変更',
              key: 'G',
              children: [
                { id: 'graph:total', label: '全体の使用率', checked: !perCore },
                { id: 'graph:cores', label: '論理プロセッサ', checked: perCore },
              ],
            },
          ]
        : []),
      { id: 'summary', label: '概要表示', key: 'S', checked: summary },
      SEPARATOR,
      { id: 'copy', label: 'コピー', key: 'C' },
    ];
    menus.open(event, 'パフォーマンス', entries, (id) => {
      if (id === 'graph:total') perCore = false;
      else if (id === 'graph:cores') perCore = true;
      else if (id === 'summary') summary = !summary;
      else if (id === 'copy') void copy();
    });
  }
</script>

<PageHeader title="パフォーマンス" />

<div class="layout" class:summary oncontextmenu={openMenu} role="presentation">
  <ul class="list" aria-label="リソース">
    {#each resources as r (r.id)}
      <li>
        <button
          type="button"
          class="card"
          class:active={current?.id === r.id}
          aria-pressed={current?.id === r.id}
          onclick={() => (selectedId = r.id)}
        >
          <span class="mini">
            <LineChart
              series={r.series}
              max={r.max}
              width={70}
              height={44}
              grid={false}
              label="{r.title} の推移"
            />
          </span>
          <span class="card-text">
            <span class="card-title">{r.title}</span>
            <span class="card-summary">{r.summary}</span>
          </span>
        </button>
      </li>
    {:else}
      <li class="empty">読み込み中…</li>
    {/each}
  </ul>

  {#if current && !summary}
    <section class="detail" aria-label="{current.title} の詳細">
      <div class="detail-head">
        <h2>{current.title}</h2>
        <span class="caption">{current.caption}</span>
      </div>
      <div class="axis">
        <span>{current.axisLabel}</span>
        <span class="legend">
          {#each current.series as s (s.label)}
            <span class="legend-item"><i style:background={s.color}></i>{s.label}</span>
          {/each}
        </span>
      </div>
      {#if current.kind === 'cpu' && perCore}
        <div class="cores" aria-label="論理プロセッサごとのグラフ">
          {#each cores.map((_, i) => i) as i (i)}
            <div class="core">
              <LineChart
                series={[
                  {
                    label: `CPU ${String(i)}`,
                    values: monitor.history.get(historyKey.core(i)) ?? [],
                    color: RESOURCE_COLORS.cpu,
                  },
                ]}
                max={100}
                grid={false}
                label="CPU {i} のグラフ"
              />
            </div>
          {/each}
        </div>
      {:else}
        <div class="big-chart">
          <LineChart series={current.series} max={current.max} label="{current.title} のグラフ" />
        </div>
      {/if}
      {#if current.kind === 'memory' && memory}
        <div class="composition" aria-label="メモリの構成">
          {#each memoryParts(memory) as part (part.label)}
            <span
              class="part"
              style:width="{shareOf(part.bytes, memory.total)}%"
              style:background={part.color}
              title={part.label}
            ></span>
          {/each}
        </div>
      {/if}
      <div class="axis bottom"><span>{historySpanLabel(intervalMs)}</span><span>0</span></div>
      <dl class="stats">
        {#each stats as s (s.label)}
          <div class="stat">
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        {/each}
      </dl>
      {#if onopenresmon}
        <button type="button" class="link" onclick={onopenresmon}>リソース モニターを開く</button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .layout.summary {
    grid-template-columns: 250px;
  }
  .cores {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 4px;
    margin-top: 4px;
  }
  .core {
    height: 70px;
    border: 1px solid var(--border);
  }
  .composition {
    display: flex;
    height: 22px;
    margin-top: 12px;
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .part {
    display: block;
    height: 100%;
    border-right: 1px solid var(--border);
  }
  .link {
    align-self: flex-start;
    margin-top: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 12px;
    min-height: 0;
    flex: 1;
    padding: 0 20px 16px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }
  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card:hover {
    background: var(--hover);
  }
  .card.active {
    background: var(--selected);
    border-color: var(--border);
  }
  .mini {
    width: 70px;
    height: 44px;
    flex: none;
  }
  .card-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .card-title {
    font-weight: 600;
  }
  .card-summary {
    color: var(--text-muted);
    font-size: 0.85em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .detail {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--surface);
    overflow-y: auto;
  }
  .detail-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
  }
  .caption {
    color: var(--text-muted);
    text-align: right;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 0.8em;
  }
  .axis.bottom {
    margin-top: 2px;
  }
  .legend {
    display: flex;
    gap: 12px;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .legend-item i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .big-chart {
    height: 240px;
    margin-top: 4px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px 24px;
    margin: 16px 0 0;
  }
  .stat dt {
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .stat dd {
    margin: 2px 0 0;
    font-size: 1.2em;
  }
</style>
