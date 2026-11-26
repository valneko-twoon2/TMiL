<script lang="ts">
  import LineChart from '../components/LineChart.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { buildResources, historySpanLabel, resourceStats } from '../performance/resources';
  import type { Monitor } from '../state/monitor.svelte';

  interface Props {
    monitor: Monitor;
    /** 更新間隔（ミリ秒）。グラフの横軸の長さに使う */
    intervalMs: number;
  }

  const { monitor, intervalMs }: Props = $props();
  let selectedId = $state('cpu');

  const resources = $derived(
    monitor.snapshot ? buildResources(monitor.snapshot, monitor.history, monitor.systemInfo) : [],
  );
  const current = $derived(resources.find((r) => r.id === selectedId) ?? resources[0]);
  const stats = $derived(
    current && monitor.snapshot ? resourceStats(current, monitor.snapshot, monitor.systemInfo) : [],
  );
</script>

<PageHeader title="パフォーマンス" />

<div class="layout">
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

  {#if current}
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
      <div class="big-chart">
        <LineChart series={current.series} max={current.max} label="{current.title} のグラフ" />
      </div>
      <div class="axis bottom"><span>{historySpanLabel(intervalMs)}</span><span>0</span></div>
      <dl class="stats">
        {#each stats as s (s.label)}
          <div class="stat">
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
</div>

<style>
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
