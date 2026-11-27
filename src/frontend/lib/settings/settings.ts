// ユーザー設定の型と読み書き。
import { DEFAULT_DETAIL_COLUMNS, normalizeDetailColumns, type DetailColumn } from '../process/columns';
import {
  DEFAULT_PROCESS_COLUMNS,
  normalizeProcessColumns,
  type ProcessColumn,
} from '../process/processColumns';
import { parseWidths, type ColumnWidths } from '../table/widths';

export const REFRESH_OPTIONS = [
  { id: 'high', label: '高', intervalMs: 500 },
  { id: 'normal', label: '標準', intervalMs: 1000 },
  { id: 'low', label: '低', intervalMs: 4000 },
  { id: 'paused', label: '一時停止', intervalMs: 0 },
] as const;
export type RefreshSpeed = (typeof REFRESH_OPTIONS)[number]['id'];

export const THEME_OPTIONS = [
  { id: 'system', label: 'システム設定に合わせる' },
  { id: 'light', label: 'ライト' },
  { id: 'dark', label: 'ダーク' },
] as const;
export type Theme = (typeof THEME_OPTIONS)[number]['id'];

/** ページ（サイドバーの並び。設定は一番下に別に置く）。 */
export const PAGES = [
  'processes',
  'performance',
  'history',
  'startup',
  'users',
  'details',
  'services',
  'resmon',
  'settings',
] as const;
export type Page = (typeof PAGES)[number];

/** ページの名前（本家のタスク マネージャーの言い方）。 */
export const PAGE_LABELS: Record<Page, string> = {
  processes: 'プロセス',
  performance: 'パフォーマンス',
  history: 'アプリの履歴',
  startup: 'スタートアップ アプリ',
  users: 'ユーザー',
  details: '詳細',
  services: 'サービス',
  resmon: 'リソース モニター',
  settings: '設定',
};

export interface Settings {
  refresh: RefreshSpeed;
  theme: Theme;
  startPage: Page;
  /** 詳細タブに出す列 */
  detailColumns: DetailColumn[];
  /** 表の列の幅（「表.列」→ px）。無い列は最初の幅 */
  columnWidths: ColumnWidths;
  /** 効率モードを入れる前に確かめる */
  confirmEfficiency: boolean;
  /** プロセス タブに出す列 */
  processColumns: ProcessColumn[];
  /** プロセス タブを種類（アプリ・バックグラウンド・Windows プロセス）ごとに分ける */
  groupByType: boolean;
  /** ウィンドウを常に手前に出す */
  alwaysOnTop: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  refresh: 'normal',
  theme: 'system',
  startPage: 'processes',
  detailColumns: [...DEFAULT_DETAIL_COLUMNS],
  columnWidths: {},
  confirmEfficiency: true,
  processColumns: [...DEFAULT_PROCESS_COLUMNS],
  groupByType: true,
  alwaysOnTop: false,
};

const defaults = (): Settings => ({
  ...DEFAULT_SETTINGS,
  detailColumns: [...DEFAULT_SETTINGS.detailColumns],
  processColumns: [...DEFAULT_SETTINGS.processColumns],
  columnWidths: {},
});

export const SETTINGS_STORAGE_KEY = 'taskmanagerlite.settings';

/** 候補に含まれる値ならそれを、そうでなければ既定値を返す。 */
function pick<T extends string>(candidates: readonly T[], value: unknown, fallback: T): T {
  return candidates.find((c) => c === value) ?? fallback;
}

/** オン・オフの値。真偽値でなければ既定値。 */
function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 保存された JSON を読む。壊れた値は既定値に戻す。 */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return defaults();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaults();
  }
  if (typeof data !== 'object' || data === null) return defaults();
  const rec = data as Record<string, unknown>;
  return {
    refresh: pick(
      REFRESH_OPTIONS.map((o) => o.id),
      rec.refresh,
      DEFAULT_SETTINGS.refresh,
    ),
    theme: pick(
      THEME_OPTIONS.map((o) => o.id),
      rec.theme,
      DEFAULT_SETTINGS.theme,
    ),
    startPage: pick(PAGES, rec.startPage, DEFAULT_SETTINGS.startPage),
    detailColumns: normalizeDetailColumns(rec.detailColumns),
    columnWidths: parseWidths(rec.columnWidths),
    confirmEfficiency: flag(rec.confirmEfficiency, DEFAULT_SETTINGS.confirmEfficiency),
    processColumns: normalizeProcessColumns(rec.processColumns),
    groupByType: flag(rec.groupByType, DEFAULT_SETTINGS.groupByType),
    alwaysOnTop: flag(rec.alwaysOnTop, DEFAULT_SETTINGS.alwaysOnTop),
  };
}

/** 更新間隔（ミリ秒）。0 は一時停止。 */
export function intervalOf(speed: RefreshSpeed): number {
  return REFRESH_OPTIONS.find((o) => o.id === speed)?.intervalMs ?? 1000;
}
