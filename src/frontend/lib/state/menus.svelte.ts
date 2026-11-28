import type { MenuEntry } from '../menu/menu';

export interface OpenMenu {
  x: number;
  y: number;
  label: string;
  entries: MenuEntry[];
  onselect: (id: string) => void;
}

export class ContextMenus {
  current = $state<OpenMenu | null>(null);

  /**
   * メニューを開く。キーボード（Shift+F10 など）で開いたときは位置が 0 になるので、
   * 対象の要素の左下に出す。
   */
  open(event: MouseEvent, label: string, entries: MenuEntry[], onselect: (id: string) => void): void {
    event.preventDefault();
    event.stopPropagation();
    let { clientX: x, clientY: y } = event;
    const target = event.currentTarget;
    if (x === 0 && y === 0 && typeof Element !== 'undefined' && target instanceof Element) {
      const rect = target.getBoundingClientRect();
      x = rect.left + 16;
      y = rect.bottom;
    }
    this.current = { x, y, label, entries, onselect };
  }

  close(): void {
    this.current = null;
  }

  select(id: string): void {
    const menu = this.current;
    this.current = null;
    menu?.onselect(id);
  }
}
