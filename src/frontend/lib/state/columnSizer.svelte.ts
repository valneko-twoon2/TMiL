// 表の列の幅の保持。ドラッグ中は画面だけ変え、つかみ終えたら設定に保存する。
import { clampWidth, widthOf, withWidth, type TableName } from '../table/widths';
import type { SettingsStore } from './settings.svelte';

export class ColumnSizer {
  #live = $state<{ column: string; width: number } | null>(null);
  readonly #settings: SettingsStore;
  readonly #table: TableName;

  constructor(settings: SettingsStore, table: TableName) {
    this.#settings = settings;
    this.#table = table;
  }

  /** 列の幅（px）。 */
  width(column: string): number {
    if (this.#live?.column === column) return this.#live.width;
    return widthOf(this.#settings.value.columnWidths, this.#table, column);
  }

  /** 列の幅の合計（表がこれより狭くならないようにする）。 */
  total(columns: readonly string[]): number {
    return columns.reduce((sum, c) => sum + this.width(c), 0);
  }

  /** 幅を変える。`done` まではドラッグ中として保存しない。`null` は最初の幅に戻す。 */
  resize(column: string, width: number | null, done: boolean): void {
    if (!done && width !== null) {
      this.#live = { column, width: clampWidth(width) };
      return;
    }
    this.#live = null;
    const widths = withWidth(this.#settings.value.columnWidths, this.#table, column, width);
    this.#settings.update({ columnWidths: widths });
  }
}
