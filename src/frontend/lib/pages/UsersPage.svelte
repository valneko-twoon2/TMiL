<script lang="ts">
  import DataTable from '../components/DataTable.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { formatPercent } from '../format/format';
  import { shareOf } from '../format/heat';
  import type { ProcessInfo } from '../model/types';
  import { processTableColumns } from '../process/processTable';
  import type { IconStore } from '../state/icons.svelte';
  import type { Monitor } from '../state/monitor.svelte';
  import type { ProcessActions } from '../state/processActions.svelte';
  import type { SettingsStore } from '../state/settings.svelte';
  import { filterUsers, groupByUser, userColumns, type UserRow } from '../users/users';

  interface Props {
    monitor: Monitor;
    settings: SettingsStore;
    icons: IconStore;
    processActions: ProcessActions;
    query: string;
    ongotodetails?: (pid: number) => void;
  }

  const { monitor, settings, icons, processActions, query, ongotodetails }: Props = $props();

  let selectedUser = $state<string | null>(null);
  let selectedPid = $state<string | null>(null);

  const snapshot = $derived(monitor.snapshot);
  const memoryTotal = $derived(snapshot?.memory.total ?? 0);
  const users = $derived(filterUsers(groupByUser(snapshot?.processes ?? []), query));
  const current = $derived(users.find((u) => u.key === selectedUser) ?? users[0]);
  const totals = $derived({
    cpu: formatPercent(snapshot?.cpu.usage ?? 0, 0),
    memory: formatPercent(shareOf(snapshot?.memory.used ?? 0, memoryTotal), 0),
  });

  const columns = $derived(userColumns(memoryTotal));

  const processColumns = $derived(
    processTableColumns(
      [
        { key: 'image', label: '名前' },
        'pid',
        'description',
        'state',
        'cpu',
        { key: 'memory', label: 'メモリ' },
        'diskTotal',
        'gpu',
      ],
      {
        icon: (exe) => icons.get(exe),
        description: (exe) => icons.description(exe),
        memoryTotal,
      },
    ),
  );

  function openProcessMenu(event: MouseEvent, p: ProcessInfo) {
    processActions.openMenu(event, p, {
      middle: ongotodetails ? [{ id: 'details', label: '詳細の表示に移動', key: 'D' }] : [],
      onextra: (id) => {
        if (id === 'details') ongotodetails?.(p.pid);
      },
    });
  }
</script>

<PageHeader title="ユーザー" />

<div class="split">
  <DataTable
    label="ユーザー一覧"
    table="users"
    {columns}
    rows={users}
    rowKey={(u: UserRow) => u.key}
    {settings}
    selected={current?.key ?? null}
    onselect={(key: string) => (selectedUser = key)}
    summaries={{ cpu: totals.cpu, memory: totals.memory }}
    empty={snapshot ? '該当するユーザーはいません' : '読み込み中…'}
    testid="users-table"
  />
  <h2 class="caption">{current ? `${current.name} のプロセス` : 'プロセス'}</h2>
  <DataTable
    label="ユーザーのプロセス"
    table="userprocesses"
    columns={processColumns}
    rows={current?.processes ?? []}
    rowKey={(p: ProcessInfo) => String(p.pid)}
    {settings}
    initialSort={{ key: 'cpu', direction: 'desc' }}
    selected={selectedPid}
    onselect={(key: string) => (selectedPid = key)}
    oncontextmenu={openProcessMenu}
    ondelete={(p: ProcessInfo) => void processActions.end([p])}
    empty="プロセスはありません"
    testid="user-processes-table"
  />
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .caption {
    margin: 0 20px 6px;
    font-size: 0.95rem;
    font-weight: 600;
  }
</style>
