export const ROW_HEIGHT_HINT = 24;
export const ROWS_PER_FRAME = 150;

export function firstRows(viewportHeight: number | null): number {
  if (viewportHeight === null || !Number.isFinite(viewportHeight)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.ceil(Math.max(0, viewportHeight) / ROW_HEIGHT_HINT));
}

export function growRows(limit: number, total: number, step = ROWS_PER_FRAME): number {
  return limit >= total ? limit : Math.min(total, limit + Math.max(1, step));
}

export function takeRows<T>(rows: readonly T[], limit: number): readonly T[] {
  return limit >= rows.length ? rows : rows.slice(0, Math.max(0, limit));
}
