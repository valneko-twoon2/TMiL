// プロセスのアイコンを問い合わせる対象を決める（純粋関数）。

/** 1 回に問い合わせる数の上限（バックエンドの上限と同じ）。 */
export const ICON_REQUEST_LIMIT = 256;

/**
 * まだ知らず、問い合わせ中でもない実行ファイルの場所を、重複なしで返す。
 * 空の場所（権限が無くて分からないプロセスなど）は問い合わせない。
 */
export function unknownExes(
  exes: readonly string[],
  known: ReadonlyMap<string, unknown>,
  pending: ReadonlySet<string>,
  limit = ICON_REQUEST_LIMIT,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const exe of exes) {
    if (result.length >= limit) break;
    if (exe.trim() === '' || seen.has(exe) || known.has(exe) || pending.has(exe)) continue;
    seen.add(exe);
    result.push(exe);
  }
  return result;
}
