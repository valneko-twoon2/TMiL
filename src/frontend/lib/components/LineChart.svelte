<script lang="ts">
  import { areaPoints, linePoints } from '../chart/chart';
  import { HISTORY_CAPACITY } from '../history/history';
  import type { Series } from '../performance/resources';

  interface Props {
    series: Series[];
    max: number;
    width?: number;
    height?: number;
    grid?: boolean;
    label: string;
  }

  const { series, max, width = 600, height = 240, grid = true, label }: Props = $props();

  const lines = $derived(
    series.map((s) => {
      const points = linePoints(s.values, max, width, height, HISTORY_CAPACITY);
      return { ...s, points, area: areaPoints(points, width, height) };
    }),
  );
  const gridX = $derived(Array.from({ length: 9 }, (_, i) => ((i + 1) * width) / 10));
  const gridY = $derived(Array.from({ length: 9 }, (_, i) => ((i + 1) * height) / 10));
</script>

<svg
  class="chart"
  viewBox="0 0 {width} {height}"
  preserveAspectRatio="none"
  role="img"
  aria-label={label}
  style:--chart-color={series[0]?.color ?? 'currentColor'}
>
  <rect x="0" y="0" {width} {height} class="frame" />
  {#if grid}
    {#each gridX as x (x)}
      <line x1={x} y1="0" x2={x} y2={height} class="grid" />
    {/each}
    {#each gridY as y (y)}
      <line x1="0" y1={y} x2={width} y2={y} class="grid" />
    {/each}
  {/if}
  {#each lines as line (line.label)}
    {#if line.points}
      <polygon points={line.area} fill={line.color} fill-opacity="0.12" />
      <polyline
        points={line.points}
        fill="none"
        stroke={line.color}
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    {/if}
  {/each}
</svg>

<style>
  .chart {
    display: block;
    width: 100%;
    height: 100%;
  }
  .frame {
    fill: none;
    stroke: var(--chart-color);
    stroke-opacity: 0.6;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .grid {
    stroke: var(--chart-color);
    stroke-opacity: 0.12;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
</style>
