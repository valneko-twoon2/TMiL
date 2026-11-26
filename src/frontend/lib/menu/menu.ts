// 右クリックメニューの項目と位置の計算（純粋関数）。

export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** チェック付きの項目（列の選択など）。undefined なら普通の項目 */
  checked?: boolean;
}

export type MenuEntry = MenuItem | { separator: true };

export const SEPARATOR: MenuEntry = { separator: true };

export function isItem(entry: MenuEntry): entry is MenuItem {
  return !('separator' in entry);
}

/** 画面からはみ出さない位置。入りきらないときは左・上に開く。 */
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

/** ブラウザ標準のメニューを残す場所か（文字を入力する欄では、コピーや貼り付けに使う）。 */
export function allowsNativeMenu(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  const field = target.closest('input, textarea, [contenteditable="true"]');
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    return ['text', 'search', 'url', 'email', 'number', 'password'].includes(field.type);
  }
  return true;
}
