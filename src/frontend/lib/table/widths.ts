// 表の列の幅（純粋関数）。幅は「表.列」をキーにして設定に保存する。

export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 1200;
/** 保存する数の上限（壊れた設定で膨らまないように）。 */
const MAX_ENTRIES = 100;
const KEY_PATTERN = /^[a-z]+\.[A-Za-z0-9]+$/;

export type ColumnWidths = Record<string, number>;
export type TableName = 'processes' | 'details' | 'startup';

/** 最初の幅。 */
export const DEFAULT_WIDTHS: Record<TableName, Record<string, number>> = {
  processes: { name: 300, status: 90, cpu: 90, memory: 110, disk: 110 },
  details: {
    name: 220,
    pid: 70,
    state: 80,
    user: 110,
    cpu: 70,
    memory: 100,
    disk: 90,
    diskRead: 120,
    diskWrite: 120,
    parentPid: 70,
    runTime: 100,
    startTime: 160,
    exe: 280,
    command: 360,
  },
  startup: { name: 240, program: 340, location: 200, enabled: 80 },
};

const FALLBACK_WIDTH = 120;

/** 幅を許す範囲に収める（小数は丸める）。 */
export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

/** 列の幅。保存されていなければ最初の幅。 */
export function widthOf(widths: ColumnWidths, table: TableName, column: string): number {
  return widths[`${table}.${column}`] ?? DEFAULT_WIDTHS[table][column] ?? FALLBACK_WIDTH;
}

/** 列の幅を変えた新しい値。`null` なら最初の幅に戻す。 */
export function withWidth(
  widths: ColumnWidths,
  table: TableName,
  column: string,
  width: number | null,
): ColumnWidths {
  const key = `${table}.${column}`;
  const rest = Object.fromEntries(Object.entries(widths).filter(([k]) => k !== key));
  return width === null ? rest : { ...rest, [key]: clampWidth(width) };
}

/** 保存されていた値を読む。形の違うものは捨てる。 */
export function parseWidths(value: unknown): ColumnWidths {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((e): e is [string, number] => KEY_PATTERN.test(e[0]) && typeof e[1] === 'number')
    .slice(0, MAX_ENTRIES)
    .map(([key, width]) => [key, clampWidth(width)] as const);
  return Object.fromEntries(entries);
}
