import { describe, expect, it, vi } from 'vitest';
import { SummaryView } from './summaryView.svelte';

describe('要約ビュー', () => {
  describe('equivalence', () => {
    it('切り替えるたびに、ウィンドウにも伝える', async () => {
      const setSummaryView = vi.fn().mockResolvedValue(undefined);
      const view = new SummaryView({ setSummaryView }, { show: vi.fn() });
      await view.toggle();
      expect(view.on).toBe(true);
      await view.toggle();
      expect(view.on).toBe(false);
      expect(setSummaryView.mock.calls).toEqual([[true], [false]]);
    });
  });

  describe('boundary', () => {
    it('ウィンドウを変えられなければ元に戻し、理由を知らせる', async () => {
      const show = vi.fn();
      const view = new SummaryView(
        { setSummaryView: () => Promise.reject(new Error('変えられない')) },
        { show },
      );
      await view.toggle();
      expect(view.on).toBe(false);
      expect(show).toHaveBeenCalledWith('変えられない', 'error');
    });
  });
});
