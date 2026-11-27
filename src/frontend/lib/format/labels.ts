import type { ProcessState, StartupLocation, Priority } from '../model/types';

const PROCESS_STATE_LABEL: Record<ProcessState, string> = {
  running: '実行中',
  sleeping: '待機中',
  stopped: '中断',
  zombie: '終了済み',
  other: '',
};

export function processStateLabel(state: ProcessState): string {
  return PROCESS_STATE_LABEL[state];
}

export function processStatusBadge(
  state: ProcessState,
  marks: { efficient?: boolean; suspended?: boolean; growing?: boolean } = {},
): string {
  if (marks.suspended === true) return PROCESS_STATE_LABEL.stopped;
  if (state === 'stopped' || state === 'zombie') return PROCESS_STATE_LABEL[state];
  if (marks.efficient === true) return '効率モード';
  return marks.growing === true ? 'メモリ増加中' : '';
}

const STARTUP_LOCATION_LABEL: Record<StartupLocation, string> = {
  registryUser: 'レジストリ（ユーザー）',
  registryMachine: 'レジストリ（全ユーザー）',
  folderUser: 'スタートアップ フォルダー（ユーザー）',
  folderCommon: 'スタートアップ フォルダー（全ユーザー）',
  autostartUser: 'autostart（ユーザー）',
  autostartSystem: 'autostart（システム）',
};

export function startupLocationLabel(location: StartupLocation): string {
  return STARTUP_LOCATION_LABEL[location];
}

const PRIORITY_LABEL: Record<Priority, string> = {
  realtime: 'リアルタイム',
  high: '高',
  aboveNormal: '通常以上',
  normal: '通常',
  belowNormal: '通常以下',
  low: '低',
};

export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABEL[priority];
}
