<script lang="ts">
  // リソース モニター。本家（resmon.exe）と同じく、概要・CPU・メモリ・ディスク・ネットワークのタブに分け、
  // チェックしたプロセスでほかの表を絞り込み、右にグラフを並べる。
  import { untrack } from 'svelte';
  import DataTable from '../components/DataTable.svelte';
  import LineChart from '../components/LineChart.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Panel, { PANEL_HEIGHT } from '../components/Panel.svelte';
  import ResizeHandle from '../components/ResizeHandle.svelte';
  import { niceMax } from '../chart/chart';
  import { formatBits, formatBytes, formatFrequency, formatPercent, formatRate } from '../format/format';
  import { shareOf } from '../format/heat';
  import { diskKeys, historyKey } from '../history/history';
  import { SEPARATOR, type MenuEntry } from '../menu/menu';
  import type { Connection, DiskStats, ProcessInfo, ServiceInfo } from '../model/types';
  import { memoryParts, RESOURCE_COLORS, visibleNetworks } from '../performance/resources';
  import { processTableColumns, type ProcessColumnSpec } from '../process/processTable';
  import {
    connectionCounts,
    connectionKey,
    connectionMatches,
    diskProcesses,
    handleColumns,
    handleKey,
    imageNames,
    isListening,
    listenColumns,
    MODULE_COLUMNS,
    moduleRows,
    networkProcesses,
    onlyChecked,
    RESMON_TABS,
    STORAGE_COLUMNS,
    sumSeries,
    tcpColumns,
    uniqueConnections,
    type ModuleRow,
    type ResmonTab,
  } from '../resmon/resmon';
  import { SERVICE_COLUMNS, serviceCommands } from '../services/services';
  import type { IconStore } from '../state/icons.svelte';
  import { ColumnSizer } from '../state/columnSizer.svelte';
  import type { ContextMenus } from '../state/menus.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { ProcessActions } from '../state/processActions.svelte';
  import type { ResourceMonitorState } from '../state/resmon.svelte';
  import type { ServiceList } from '../state/services.svelte';
  import type { SettingsStore } from '../state/settings.svelte';

  interface Props {
    monitor: Monitor;
    settings: SettingsStore;
    icons: IconStore;
    menus: ContextMenus;
    processActions: ProcessActions;
    services: ServiceList;
    resmon: ResourceMonitorState;
  }

  const { monitor, settings, icons, menus, processActions, services, resmon }: Props = $props();

  /** 接続の一覧とサービスの一覧を読み直す間隔 */
  const CONNECTIONS_MS = 2000;
  const SERVICES_MS = 10000;
  /** 右のグラフの欄の幅（px）。つまみで変えられ、設定に残る */
  const GRAPHS_WIDTH = { initial: 260, min: 180, max: 640 };
  const sizer = untrack(() => new ColumnSizer(settings, 'resmon', { graphs: GRAPHS_WIDTH.initial }));
  const graphsWidth = $derived(Math.min(GRAPHS_WIDTH.max, Math.max(GRAPHS_WIDTH.min, sizer.width('graphs'))));

  let tab = $state<ResmonTab>('overview');
  let selected = $state<string | null>(null);
  /** ネットワーク タブの、ポートやアドレスでの絞り込み */
  let portQuery = $state('');
  /** CPU タブの、ハンドルの検索欄（前の検索の文字を残す） */
  let handleInput = $state(untrack(() => resmon.handlesQuery));

  const snapshot = $derived(monitor.snapshot);
  const processes = $derived(snapshot?.processes ?? []);
  const memoryTotal = $derived(snapshot?.memory.total ?? 0);
  const windows = $derived((monitor.systemInfo?.osName ?? 'Windows').toLowerCase().includes('windows'));
  const checked = $derived(resmon.checked);
  const counts = $derived(connectionCounts(resmon.connections));
  const image = $derived(imageNames(processes));
  const filtering = $derived(portQuery.trim() !== '');
  const matched = $derived(
    uniqueConnections(resmon.connections).filter((c) => connectionMatches(c, portQuery, image)),
  );
  const connections = $derived(onlyChecked(matched, (c) => c.pid, checked));
  const handles = $derived(onlyChecked(resmon.handles, (h) => h.pid, checked));
  const handlesEmpty = $derived(
    resmon.searchingHandles
      ? '検索中…'
      : (resmon.handlesError ??
          (resmon.handlesQuery === ''
            ? windows
              ? 'ファイルかフォルダーの場所を入れて検索してください'
              : 'ファイルの名前や場所の一部を入れて検索してください'
            : '開いているプロセスは見つかりませんでした')),
  );
  const tcp = $derived(connections.filter((c) => c.protocol === 'tcp' && !isListening(c)));
  const listening = $derived(connections.filter(isListening));
  const checkedProcesses = $derived(processes.filter((p) => checked.has(p.pid)));
  const checkedKey = $derived(
    checkedProcesses
      .map((p) => p.pid)
      .sort((a, b) => a - b)
      .join(','),
  );

  const columns = (specs: readonly ProcessColumnSpec[]) =>
    processTableColumns(specs, {
      icon: (exe) => icons.get(exe),
      description: (exe) => icons.description(exe),
      memoryTotal,
      averageCpu: (pid) => resmon.average(pid),
      connections: (pid) => counts.get(pid) ?? 0,
    });

  const cpuColumns = $derived(
    columns(['image', 'pid', 'description', 'state', 'threads', 'handles', 'cpu', 'averageCpu']),
  );
  const memoryColumns = $derived(
    columns(['image', 'pid', 'commit', { key: 'memory', label: 'ワーキング セット' }, 'threads']),
  );
  const diskColumns = $derived(
    columns([
      'image',
      'pid',
      { key: 'diskRead', label: '読み取り (B/秒)' },
      { key: 'diskWrite', label: '書き込み (B/秒)' },
      { key: 'diskTotal', label: '合計 (B/秒)' },
      'readTotal',
      'writeTotal',
    ]),
  );
  const networkColumns = $derived(columns(['image', 'pid', { key: 'connections', label: '接続数' }, 'cpu']));
  const serviceColumns = SERVICE_COLUMNS.filter((c) => c.key !== 'startType');

  // グラフ（右側）
  const get = (key: string) => monitor.history.get(key) ?? [];
  const diskSeries = $derived(
    sumSeries(
      diskKeys(snapshot?.disks ?? []).flatMap((k) => [
        get(historyKey.diskRead(k)),
        get(historyKey.diskWrite(k)),
      ]),
    ),
  );
  const networkSeries = $derived(
    sumSeries(
      visibleNetworks(snapshot?.networks ?? []).flatMap((n) => [
        get(historyKey.netReceive(n.name)),
        get(historyKey.netTransmit(n.name)),
      ]),
    ),
  );
  const diskRate = $derived(
    (snapshot?.disks ?? []).reduce((sum, d) => sum + d.readPerSec + d.writtenPerSec, 0),
  );
  const networkRate = $derived(
    visibleNetworks(snapshot?.networks ?? []).reduce(
      (sum, n) => sum + n.receivedPerSec + n.transmittedPerSec,
      0,
    ),
  );
  const memoryShare = $derived(shareOf(snapshot?.memory.used ?? 0, memoryTotal));

  // 接続の一覧は計測結果に入っていないので、使うタブを開いている間だけ読み直す
  $effect(() => {
    if (tab !== 'overview' && tab !== 'network') return;
    void resmon.refreshConnections();
    const timer = setInterval(() => void resmon.refreshConnections(), CONNECTIONS_MS);
    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    if (tab !== 'cpu') return;
    void services.load();
    const timer = setInterval(() => void services.load(), SERVICES_MS);
    return () => {
      clearInterval(timer);
    };
  });

  // CPU タブでは、チェックしたプロセスのモジュールを読む（チェックが変わったときだけ）
  $effect(() => {
    if (tab !== 'cpu' || checkedKey === '') return;
    void resmon.loadModules(checkedProcesses);
  });

  const toggle = (p: ProcessInfo, on: boolean) => {
    resmon.toggle(p.pid, on);
  };
  const isChecked = (p: ProcessInfo) => checked.has(p.pid);
  const pidKey = (p: ProcessInfo) => String(p.pid);

  function openProcessMenu(event: MouseEvent, p: ProcessInfo) {
    const busy = processActions.busy;
    const suspended = processActions.marks(p).suspended || p.state === 'stopped';
    const entries: MenuEntry[] = [
      { id: 'end', label: 'プロセスの終了', key: 'E', disabled: busy },
      { id: 'tree', label: 'プロセス ツリーの終了', key: 'T', disabled: busy },
      SEPARATOR,
      { id: 'suspend', label: 'プロセスの中断', key: 'S', disabled: busy || suspended },
      { id: 'resume', label: 'プロセスの再開', key: 'R', disabled: busy || !suspended },
      SEPARATOR,
      { id: 'search', label: 'オンライン検索', key: 'N' },
    ];
    menus.open(event, 'プロセスの操作', entries, (id) => {
      if (id === 'end') void processActions.end([p]);
      else if (id === 'tree') processActions.confirmTree(p);
      else if (id === 'suspend') void processActions.suspend([p]);
      else if (id === 'resume') void processActions.resume([p]);
      else if (id === 'search') void processActions.search(p.name);
    });
  }

  function openServiceMenu(event: MouseEvent, s: ServiceInfo) {
    const can = serviceCommands(s);
    const entries: MenuEntry[] = [
      { id: 'start', label: 'サービスの開始', key: 'S', disabled: !can.start || services.busy },
      { id: 'stop', label: 'サービスの停止', key: 'O', disabled: !can.stop || services.busy },
      { id: 'restart', label: 'サービスの再起動', key: 'R', disabled: !can.restart || services.busy },
      SEPARATOR,
      { id: 'search', label: 'オンライン検索', key: 'N' },
    ];
    menus.open(event, 'サービスの操作', entries, (id) => {
      if (id === 'start' || id === 'stop' || id === 'restart') void services.control(s, id);
      else if (id === 'search') void processActions.search(s.name);
    });
  }

  const onselect = (key: string) => {
    selected = key;
  };
</script>

<PageHeader title="リソース モニター" />

<div class="tabs" role="tablist" aria-label="リソース モニターのタブ">
  {#each RESMON_TABS as t (t.id)}
    <button
      type="button"
      role="tab"
      class="tab"
      class:active={tab === t.id}
      aria-selected={tab === t.id}
      onclick={() => (tab = t.id)}
    >
      {t.label}
    </button>
  {/each}
  {#if checked.size > 0}
    <span class="checked">
      {checked.size} 個のプロセスで絞り込み中
      <button
        type="button"
        class="link"
        onclick={() => {
          resmon.checked.clear();
        }}
      >
        解除
      </button>
    </span>
  {/if}
</div>

{#snippet processTable(
  label: string,
  table: string,
  cols: typeof cpuColumns,
  rows: ProcessInfo[],
  testid: string,
)}
  <DataTable
    viewportHeight={PANEL_HEIGHT}
    {label}
    {table}
    columns={cols}
    {rows}
    rowKey={pidKey}
    {settings}
    initialSort={{
      key: cols.some((c) => c.key === 'cpu') ? 'cpu' : 'image',
      direction: cols.some((c) => c.key === 'cpu') ? 'desc' : 'asc',
    }}
    {selected}
    {onselect}
    checked={isChecked}
    oncheck={toggle}
    oncontextmenu={openProcessMenu}
    ondelete={(p: ProcessInfo) => void processActions.end([p])}
    empty={snapshot ? '該当するプロセスはありません' : '読み込み中…'}
    {testid}
  />
{/snippet}

{#snippet graph(
  title: string,
  right: string,
  values: readonly number[],
  max: number,
  color: string,
  extra: readonly number[] | null,
)}
  <div class="graph">
    <div class="graph-head"><span>{title}</span><span>{right}</span></div>
    <div class="chart">
      <LineChart
        series={[
          { label: title, values, color },
          ...(extra ? [{ label: '選んだプロセス', values: extra, color: '#e08a00' }] : []),
        ]}
        {max}
        grid={false}
        label="{title} のグラフ"
      />
    </div>
  </div>
{/snippet}

<div class="layout" style:grid-template-columns="minmax(0, 1fr) {graphsWidth}px">
  <div class="panels">
    {#if tab === 'overview'}
      <Panel
        title="CPU"
        summary="CPU 使用率 {formatPercent(snapshot?.cpu.usage ?? 0, 0)}  周波数 {formatFrequency(
          snapshot?.cpu.frequencyMhz ?? 0,
        )}"
      >
        {@render processTable('CPU', 'rmcpu', cpuColumns, processes, 'resmon-cpu')}
      </Panel>
      <Panel title="ディスク" summary="ディスク I/O {formatRate(diskRate)}">
        {@render processTable(
          'ディスク',
          'rmdisk',
          diskColumns,
          onlyChecked(diskProcesses(processes, checked), (p) => p.pid, checked),
          'resmon-disk',
        )}
      </Panel>
      <Panel title="ネットワーク" summary="ネットワーク I/O {formatBits(networkRate)}">
        {@render processTable(
          'ネットワーク',
          'rmnetwork',
          networkColumns,
          onlyChecked(networkProcesses(processes, resmon.connections), (p) => p.pid, checked),
          'resmon-network',
        )}
      </Panel>
      <Panel title="メモリ" summary="使用中の物理メモリ {formatPercent(memoryShare, 0)}">
        {@render processTable('メモリ', 'rmmemory', memoryColumns, processes, 'resmon-memory')}
      </Panel>
    {:else if tab === 'cpu'}
      <Panel title="プロセス" summary="CPU 使用率 {formatPercent(snapshot?.cpu.usage ?? 0, 0)}">
        {@render processTable('プロセス', 'rmcpu', cpuColumns, processes, 'resmon-cpu')}
      </Panel>
      <Panel
        title="サービス"
        summary={checked.size > 0 ? '選んだプロセスのサービス' : `${String(services.list.length)} 個`}
      >
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="サービス"
          table="rmservices"
          columns={serviceColumns}
          rows={onlyChecked(services.list, (s) => s.pid, checked)}
          rowKey={(s: ServiceInfo) => s.name}
          {settings}
          {selected}
          {onselect}
          oncontextmenu={openServiceMenu}
          empty={services.loaded ? 'サービスはありません' : '読み込み中…'}
          testid="resmon-services"
        />
      </Panel>
      <Panel
        title="関連付けられたハンドル"
        summary={resmon.handlesQuery === '' ? '' : `${String(handles.length)} 件`}
      >
        <form
          class="filter"
          onsubmit={(e) => {
            e.preventDefault();
            void resmon.searchHandles(handleInput);
          }}
        >
          <input
            type="search"
            value={handleInput}
            oninput={(e) => (handleInput = e.currentTarget.value)}
            placeholder={windows
              ? 'ファイルかフォルダーの場所（例: C:\\Users\\me\\report.docx）'
              : 'ファイルの名前や場所の一部（例: report.txt）'}
            aria-label="ハンドルの検索"
            data-testid="resmon-handle-search"
          />
          <button type="submit" disabled={resmon.searchingHandles}>検索</button>
        </form>
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="関連付けられたハンドル"
          table="rmhandles"
          columns={handleColumns(image)}
          rows={handles}
          rowKey={handleKey}
          {settings}
          {selected}
          {onselect}
          empty={handlesEmpty}
          testid="resmon-handles"
        />
      </Panel>
      <Panel
        title="関連付けられたモジュール"
        summary={checked.size > 0 ? '' : 'プロセスにチェックを付けると表示します'}
      >
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="関連付けられたモジュール"
          table="rmmodules"
          columns={MODULE_COLUMNS}
          rows={checked.size > 0 ? moduleRows(resmon.modules.filter((m) => checked.has(m.pid))) : []}
          rowKey={(m: ModuleRow) => `${String(m.pid)}:${m.path}`}
          {settings}
          {selected}
          {onselect}
          empty={checked.size > 0
            ? (resmon.modules.find((m) => m.error !== null)?.error ?? '読み込み中…')
            : 'プロセスにチェックを付けてください'}
          testid="resmon-modules"
        />
      </Panel>
    {:else if tab === 'memory'}
      <Panel title="プロセス" summary="使用中の物理メモリ {formatPercent(memoryShare, 0)}">
        {@render processTable('プロセス', 'rmmemory', memoryColumns, processes, 'resmon-memory')}
      </Panel>
      {#if snapshot}
        {@const parts = memoryParts(snapshot.memory)}
        <section class="memory" aria-label="物理メモリ">
          <h2>物理メモリ</h2>
          <div class="bar">
            {#each parts as part (part.label)}
              <span
                class="part"
                style:width="{shareOf(part.bytes, memoryTotal)}%"
                style:background={part.color}
              ></span>
            {/each}
          </div>
          <dl class="legend">
            {#each parts as part (part.label)}
              <div>
                <dt><i style:background={part.color}></i>{part.label}</dt>
                <dd>{formatBytes(part.bytes)}</dd>
              </div>
            {/each}
            <div>
              <dt>合計</dt>
              <dd>{formatBytes(memoryTotal)}</dd>
            </div>
          </dl>
        </section>
      {/if}
    {:else if tab === 'disk'}
      <Panel title="ディスク アクティビティのあるプロセス" summary="ディスク I/O {formatRate(diskRate)}">
        {@render processTable(
          'ディスク アクティビティのあるプロセス',
          'rmdisk',
          diskColumns,
          diskProcesses(processes, checked),
          'resmon-disk',
        )}
      </Panel>
      <Panel title="記憶域" summary="{String(snapshot?.disks.length ?? 0)} 台">
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="記憶域"
          table="rmstorage"
          columns={STORAGE_COLUMNS}
          rows={snapshot?.disks ?? []}
          rowKey={(d: DiskStats) => d.mountPoint}
          {settings}
          {selected}
          {onselect}
          testid="resmon-storage"
        />
      </Panel>
    {:else}
      <div class="filter">
        <input
          type="search"
          value={portQuery}
          oninput={(e) => (portQuery = e.currentTarget.value)}
          placeholder="ポートやアドレスで絞り込み（例: 3000、:443、127.0.0.1）"
          aria-label="ポートやアドレスで絞り込み"
          data-testid="resmon-port-filter"
        />
        {#if filtering}
          <span class="count">{matched.length} 件</span>
        {/if}
      </div>
      <Panel
        title="ネットワーク アクティビティのあるプロセス"
        summary="ネットワーク I/O {formatBits(networkRate)}"
      >
        {@render processTable(
          'ネットワーク アクティビティのあるプロセス',
          'rmnetwork',
          networkColumns,
          networkProcesses(processes, filtering ? matched : resmon.connections),
          'resmon-network',
        )}
      </Panel>
      {#if resmon.connectionsError}
        <div class="banner" role="alert">接続の一覧を取れません: {resmon.connectionsError}</div>
      {/if}
      <Panel title="TCP 接続" summary="{String(tcp.length)} 件">
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="TCP 接続"
          table="rmtcp"
          columns={tcpColumns(image)}
          rows={tcp}
          rowKey={connectionKey}
          {settings}
          {selected}
          {onselect}
          testid="resmon-tcp"
        />
      </Panel>
      <Panel title="リッスン ポート" summary="{String(listening.length)} 件">
        <DataTable
          viewportHeight={PANEL_HEIGHT}
          label="リッスン ポート"
          table="rmlisten"
          columns={listenColumns(image)}
          rows={listening}
          rowKey={(c: Connection) => connectionKey(c)}
          {settings}
          {selected}
          {onselect}
          initialSort={{ key: 'port', direction: 'asc' }}
          testid="resmon-listen"
        />
      </Panel>
    {/if}
  </div>

  <div class="side">
    <ResizeHandle
      width={graphsWidth}
      label="グラフの欄"
      edge="left"
      onresize={(width: number | null, done: boolean) => {
        sizer.resize('graphs', width, done);
      }}
    />
    <aside class="graphs" aria-label="グラフ">
      {#if tab === 'overview' || tab === 'cpu'}
        {@render graph(
          'CPU',
          formatPercent(snapshot?.cpu.usage ?? 0, 0),
          get(historyKey.cpu),
          100,
          RESOURCE_COLORS.cpu,
          checked.size > 0 ? resmon.selectedHistory : null,
        )}
      {/if}
      {#if tab === 'cpu'}
        {#each (snapshot?.cpu.perCore ?? []).map((usage, i) => ({ usage, i })) as core (core.i)}
          {@render graph(
            `CPU ${String(core.i)}`,
            formatPercent(core.usage, 0),
            get(historyKey.core(core.i)),
            100,
            RESOURCE_COLORS.cpu,
            null,
          )}
        {/each}
      {/if}
      {#if tab === 'overview' || tab === 'disk'}
        {@render graph(
          'ディスク',
          formatRate(diskRate),
          diskSeries,
          niceMax(diskSeries, 1024),
          RESOURCE_COLORS.disk,
          null,
        )}
      {/if}
      {#if tab === 'disk'}
        {#each diskKeys(snapshot?.disks ?? []) as key (key)}
          {@const series = sumSeries([get(historyKey.diskRead(key)), get(historyKey.diskWrite(key))])}
          {@render graph(key, '', series, niceMax(series, 1024), RESOURCE_COLORS.disk, null)}
        {/each}
      {/if}
      {#if tab === 'overview' || tab === 'network'}
        {@render graph(
          'ネットワーク',
          formatBits(networkRate),
          networkSeries,
          niceMax(networkSeries, 1024),
          RESOURCE_COLORS.network,
          null,
        )}
      {/if}
      {#if tab === 'network'}
        {#each visibleNetworks(snapshot?.networks ?? []) as n (n.name)}
          {@const series = sumSeries([
            get(historyKey.netReceive(n.name)),
            get(historyKey.netTransmit(n.name)),
          ])}
          {@render graph(
            n.name,
            formatBits(n.receivedPerSec + n.transmittedPerSec),
            series,
            niceMax(series, 1024),
            RESOURCE_COLORS.network,
            null,
          )}
        {/each}
      {/if}
      {#if tab === 'overview' || tab === 'memory'}
        {@render graph(
          'メモリ',
          formatPercent(memoryShare, 0),
          get(historyKey.memory),
          100,
          RESOURCE_COLORS.memory,
          null,
        )}
      {/if}
    </aside>
  </div>
</div>

<style>
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0 20px 8px;
  }
  .tab {
    padding: 6px 14px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  .checked {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    color: var(--text-muted);
  }
  .link {
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .layout {
    display: grid;
    flex: 1;
    min-height: 0;
  }
  .panels {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    overflow-y: auto;
  }
  .side {
    position: relative;
    display: flex;
    min-height: 0;
  }
  .graphs {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    padding: 0 20px 16px 10px;
    overflow-y: auto;
  }
  .graph {
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--surface);
  }
  .graph-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .chart {
    height: 70px;
    margin-top: 4px;
  }
  .memory {
    margin: 0 20px 16px;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--surface);
  }
  .memory h2 {
    margin: 0 0 8px;
    font-size: 1rem;
    font-weight: 600;
  }
  .bar {
    display: flex;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .part {
    display: block;
    height: 100%;
    border-right: 1px solid var(--border);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin: 10px 0 0;
  }
  .legend dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 0.85em;
  }
  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1px solid var(--border);
  }
  .legend dd {
    margin: 2px 0 0;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 20px 6px;
  }
  .filter input {
    flex: 1;
    max-width: 480px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .filter button {
    height: 28px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .filter button:disabled {
    opacity: 0.5;
  }
  .count {
    color: var(--text-muted);
  }
  .banner {
    margin: 0 20px 4px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--danger-bg);
    color: var(--danger);
  }
</style>
