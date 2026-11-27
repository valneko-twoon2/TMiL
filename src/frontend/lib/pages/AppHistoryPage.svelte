<script lang="ts">
  import DataTable from '../components/DataTable.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { formatDateTime } from '../format/format';
  import { appHistoryColumns, filterUsage, type AppUsage } from '../history/appHistory';
  import type { AppHistoryStore } from '../state/appHistory.svelte';
  import type { IconStore } from '../state/icons.svelte';
  import type { SettingsStore } from '../state/settings.svelte';

  interface Props {
    history: AppHistoryStore;
    settings: SettingsStore;
    icons: IconStore;
    query: string;
  }

  const { history, settings, icons, query }: Props = $props();

  let selected = $state<string | null>(null);

  const columns = $derived(
    appHistoryColumns(
      (exe) => icons.get(exe),
      (exe) => icons.description(exe),
    ),
  );
  const rows = $derived(filterUsage(history.rows, query));

  // 記録だけにあるアプリ（もう動いていないもの）のアイコンも取りに行く
  $effect(() => {
    void icons.request(history.rows.map((a) => a.exe));
  });
</script>

<PageHeader title="アプリの履歴">
  {#snippet actions()}
    <button
      type="button"
      class="command"
      onclick={() => {
        history.clear();
      }}
    >
      <Icon name="close" />
      使用状況の履歴の削除
    </button>
  {/snippet}
</PageHeader>

<p class="note">
  {formatDateTime(Math.floor(history.since / 1000))} 以降のリソース使用量（このアプリが画面を出している間に記録しています）
</p>

<DataTable
  label="アプリの履歴"
  table="history"
  {columns}
  {rows}
  rowKey={(a: AppUsage) => a.key}
  {settings}
  initialSort={{ key: 'cpu', direction: 'desc' }}
  {selected}
  onselect={(key: string) => (selected = key)}
  empty="まだ記録がありません"
  testid="history-table"
/>

<style>
  .note {
    margin: 0 20px 8px;
    color: var(--text-muted);
  }
</style>
