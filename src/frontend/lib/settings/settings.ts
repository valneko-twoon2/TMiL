// ユーザー設定の型と読み書き。

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

export const PAGES = ['processes', 'performance', 'startup', 'details', 'settings'] as const;
export type Page = (typeof PAGES)[number];

export interface Settings {
  refresh: RefreshSpeed;
  theme: Theme;
  startPage: Page;
}

export const DEFAULT_SETTINGS: Settings = { refresh: 'normal', theme: 'system', startPage: 'processes' };

export const SETTINGS_STORAGE_KEY = 'tmil.settings';

/** 候補に含まれる値ならそれを、そうでなければ既定値を返す。 */
function pick<T extends string>(candidates: readonly T[], value: unknown, fallback: T): T {
  return candidates.find((c) => c === value) ?? fallback;
}

/** 保存された JSON を読む。壊れた値は既定値に戻す。 */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
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
  };
}

/** 更新間隔（ミリ秒）。0 は一時停止。 */
export function intervalOf(speed: RefreshSpeed): number {
  return REFRESH_OPTIONS.find((o) => o.id === speed)?.intervalMs ?? 1000;
}
