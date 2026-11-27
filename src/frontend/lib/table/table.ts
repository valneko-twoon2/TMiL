// 共通の表（DataTable）の列の定義と、並べ替え・文字の作り方（純粋関数）。
import { sortBy, type SortState } from '../process/process';

export interface TableColumn<T> {
  key: string;
  label: string;
  /** 数値の列（右寄せ。最初に押すと大きい順） */
  numeric?: boolean;
  /** 最初の幅（px） */
  width?: number;
  /** 並べ替えに使う値 */
  value: (row: T) => string | number | null;
  /** セルに出す文字（無ければ値をそのまま） */
  text?: (row: T) => string;
  /** 名前の横に出すアイコン（data URL。null・undefined なら決まった絵。この関数が無い列はアイコンを出さない） */
  icon?: (row: T) => string | null | undefined;
  /** 使用量に応じた背景の濃さ（0〜5） */
  heat?: (row: T) => number;
  /** 薄い文字で出す（パスやコマンドラインなど長いもの） */
  muted?: boolean;
}

/** セルに出す文字。値が null なら空。 */
export function cellText<T>(column: TableColumn<T>, row: T): string {
  if (column.text) return column.text(row);
  const value = column.value(row);
  return value === null ? '' : String(value);
}

/** 数値の列の鍵。 */
export function numericKeys<T>(columns: readonly TableColumn<T>[]): string[] {
  return columns.filter((c) => c.numeric === true).map((c) => c.key);
}

/** 並べ替える。知らない列なら元の順のまま。 */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly TableColumn<T>[],
  sort: SortState<string>,
): T[] {
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return [...rows];
  return sortBy(rows, sort, (row) => column.value(row));
}

/** 並べ替える。`pinned` に当たる行は、並び順に関係なく上にまとめる（リソース モニターのチェックした行）。 */
export function sortRowsPinned<T>(
  rows: readonly T[],
  columns: readonly TableColumn<T>[],
  sort: SortState<string>,
  pinned?: (row: T) => boolean,
): T[] {
  const sorted = sortRows(rows, columns, sort);
  if (!pinned) return sorted;
  return [...sorted.filter((row) => pinned(row)), ...sorted.filter((row) => !pinned(row))];
}

/** 列の最初の幅の一覧（ColumnSizer に渡す）。 */
export function defaultWidths<T>(columns: readonly TableColumn<T>[]): Record<string, number> {
  return Object.fromEntries(columns.flatMap((c) => (c.width === undefined ? [] : [[c.key, c.width]])));
}

/** 並べている列が今の列に無ければ、最初の列の昇順に戻す。 */
export function activeSort<T>(
  columns: readonly TableColumn<T>[],
  sort: SortState<string>,
): SortState<string> {
  if (columns.some((c) => c.key === sort.key)) return sort;
  return { key: columns[0]?.key ?? sort.key, direction: 'asc' };
}
