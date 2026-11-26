// 右クリックメニューの状態。開けるのは 1 つだけ。画面は ContextMenuHost が描く。
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
    if (x === 0 && y === 0 && event.currentTarget instanceof Element) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left + 16;
      y = rect.bottom;
    }
    this.current = { x, y, label, entries, onselect };
  }

  close(): void {
    this.current = null;
  }

  /** 項目を選ぶ。メニューを閉じてから処理を呼ぶ。 */
  select(id: string): void {
    const menu = this.current;
    this.current = null;
    menu?.onselect(id);
  }
}
