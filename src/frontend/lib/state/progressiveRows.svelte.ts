// 長い表を少しずつ描く。コンポーネントの初期化で作る（$effect を使うため）。
import { firstRows, growRows, takeRows } from '../table/progressive';

export class ProgressiveRows {
  #limit = $state(0);

  /**
   * `total` は今の行の数（増えたら、また少しずつ足す）。
   * `height` は表が見える高さ（px）。省くとウィンドウの高さ
   */
  constructor(total: () => number, height?: number) {
    const viewport = typeof window === 'undefined' ? null : (height ?? window.innerHeight);
    this.#limit = firstRows(viewport);
    $effect(() => {
      const next = growRows(this.#limit, total());
      if (next === this.#limit) return;
      // 1 つ目のフレームで今の行を描き終えてから、次のフレームで足す（同じフレームで足すと速くならない）
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          this.#limit = next;
        });
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    });
  }

  get limit(): number {
    return this.#limit;
  }

  take<T>(rows: readonly T[]): readonly T[] {
    return takeRows(rows, this.#limit);
  }
}
