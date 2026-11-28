export type Shortcut = 'refresh' | 'search' | 'runTask';

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export function shortcutOf(event: KeyLike): Shortcut | null {
  const modifier = event.ctrlKey || event.metaKey;
  if (event.altKey || event.shiftKey) return null;
  if (!modifier && event.key === 'F5') return 'refresh';
  if (!modifier) return null;
  const key = event.key.toLowerCase();
  if (key === 'f' || key === 'e') return 'search';
  if (key === 'n') return 'runTask';
  return null;
}
