export const ICON_REQUEST_LIMIT = 256;

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
