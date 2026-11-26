// 列挙値の表示名。
import type { ProcessState, StartupLocation, Priority } from '../model/types';

const PROCESS_STATE_LABEL: Record<ProcessState, string> = {
  running: '実行中',
  sleeping: '待機中',
  stopped: '中断',
  zombie: '終了済み',
  other: '',
};

/** 詳細タブに出す状態名。 */
export function processStateLabel(state: ProcessState): string {
  return PROCESS_STATE_LABEL[state];
}

/** プロセス タブの「状態」列。本家と同じく通常時は空欄にする。 */
export function processStatusBadge(state: ProcessState): string {
  return state === 'stopped' || state === 'zombie' ? PROCESS_STATE_LABEL[state] : '';
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

/** 優先度の表示名（本家のタスク マネージャーと同じ言い方）。 */
export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABEL[priority];
}
