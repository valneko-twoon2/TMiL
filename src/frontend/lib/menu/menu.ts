export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** チェック付きの項目（列の選択など）。undefined なら普通の項目 */
  checked?: boolean;
  /** アクセス キー（1 文字）。メニューを開いているときに押すと選べる。表示は「名前(E)」 */
  key?: string;
  children?: MenuEntry[];
}

export type MenuEntry = MenuItem | { separator: true };

export const SEPARATOR: MenuEntry = { separator: true };

export function isItem(entry: MenuEntry): entry is MenuItem {
  return !('separator' in entry);
}

export function itemLabel(item: MenuItem): string {
  return item.key ? `${item.label}(${item.key.toUpperCase()})` : item.label;
}

/** 押したキーに当たる項目の位置（大文字・小文字は区別しない。使えない項目は除く）。無ければ -1。 */
export function indexForKey(entries: readonly MenuEntry[], key: string): number {
  if (key.length !== 1) return -1;
  const wanted = key.toUpperCase();
  return entries.findIndex((e) => isItem(e) && e.disabled !== true && e.key?.toUpperCase() === wanted);
}

export function menuPosition(
  x: number,
  y: number,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  const margin = 4;
  const left = x + size.width + margin > view.width ? x - size.width : x;
  const top = y + size.height + margin > view.height ? y - size.height : y;
  return {
    left: Math.max(margin, Math.min(left, view.width - size.width - margin)),
    top: Math.max(margin, Math.min(top, view.height - size.height - margin)),
  };
}

/** 次に選べる項目の位置（区切りと使えない項目は飛ばし、端で反対側に回る）。無ければ -1。 */
export function nextIndex(entries: readonly MenuEntry[], current: number, step: 1 | -1): number {
  const n = entries.length;
  for (let i = 1; i <= n; i += 1) {
    const index = (((current + step * i) % n) + n) % n;
    const entry = entries[index];
    if (entry && isItem(entry) && entry.disabled !== true) return index;
  }
  return -1;
}

export function allowsNativeMenu(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  const field = target.closest('input, textarea, [contenteditable="true"]');
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    return ['text', 'search', 'url', 'email', 'number', 'password'].includes(field.type);
  }
  return true;
}
