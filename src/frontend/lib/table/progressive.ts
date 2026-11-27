// 長い表を少しずつ描く（純粋関数）。画面を切り替えたとき、見える分だけ先に描いて早く表示し、
// 残りは次のフレームから足していく。

/** 1 行の高さの目安（px）。実際（27〜29px）より少なめに見積もり、画面いっぱいの行を最初に描く */
export const ROW_HEIGHT_HINT = 24;
/** 1 フレームで足す行の数 */
export const ROWS_PER_FRAME = 150;

/** 最初に描く行の数（画面の高さに収まるだけ）。高さが分からなければ全部。 */
export function firstRows(viewportHeight: number | null): number {
  if (viewportHeight === null || !Number.isFinite(viewportHeight)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.ceil(Math.max(0, viewportHeight) / ROW_HEIGHT_HINT));
}

/** 次のフレームで描く行の数。全部描けていればそのまま。 */
export function growRows(limit: number, total: number, step = ROWS_PER_FRAME): number {
  return limit >= total ? limit : Math.min(total, limit + Math.max(1, step));
}

/** 描く行（先頭から limit 行）。 */
export function takeRows<T>(rows: readonly T[], limit: number): readonly T[] {
  return limit >= rows.length ? rows : rows.slice(0, Math.max(0, limit));
}
