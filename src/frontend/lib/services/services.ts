import type { ServiceInfo, ServiceStartType, ServiceStatus } from '../model/types';
import type { TableColumn } from '../table/table';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  running: '実行中',
  stopped: '停止',
  paused: '一時停止',
  startPending: '開始待ち',
  stopPending: '停止待ち',
  other: '',
};

const START_TYPE_LABEL: Record<ServiceStartType, string> = {
  automatic: '自動',
  manual: '手動',
  disabled: '無効',
  other: '',
};

export function serviceStatusLabel(status: ServiceStatus): string {
  return STATUS_LABEL[status];
}

export function startTypeLabel(startType: ServiceStartType): string {
  return START_TYPE_LABEL[startType];
}

export function filterServices(services: readonly ServiceInfo[], query: string): ServiceInfo[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...services];
  return services.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.displayName.toLowerCase().includes(q) ||
      s.group.toLowerCase().includes(q) ||
      (s.pid !== null && String(s.pid) === q),
  );
}

export function servicesOf(services: readonly ServiceInfo[], pids: ReadonlySet<number>): ServiceInfo[] {
  return services.filter((s) => s.pid !== null && pids.has(s.pid));
}

export function serviceCommands(service: ServiceInfo | undefined): {
  start: boolean;
  stop: boolean;
  restart: boolean;
} {
  if (!service) return { start: false, stop: false, restart: false };
  const running = service.status === 'running' || service.status === 'paused';
  return {
    start: service.status === 'stopped' && service.startType !== 'disabled',
    stop: running,
    restart: running,
  };
}

export const SERVICE_COLUMNS: readonly TableColumn<ServiceInfo>[] = [
  { key: 'name', label: '名前', width: 200, value: (s) => s.name },
  {
    key: 'pid',
    label: 'PID',
    numeric: true,
    width: 70,
    value: (s) => s.pid ?? -1,
    text: (s) => (s.pid === null ? '' : String(s.pid)),
  },
  { key: 'displayName', label: '説明', width: 300, value: (s) => s.displayName },
  { key: 'status', label: '状態', width: 90, value: (s) => serviceStatusLabel(s.status) },
  { key: 'group', label: 'グループ', width: 200, value: (s) => s.group, muted: true },
  { key: 'startType', label: 'スタートアップの種類', width: 140, value: (s) => startTypeLabel(s.startType) },
];
