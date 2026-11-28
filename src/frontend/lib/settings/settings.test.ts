import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, intervalOf, parseSettings } from './settings';

describe('parseSettings', () => {
  describe('equivalence', () => {
    it('保存された値を読む', () => {
      const raw = JSON.stringify({ refresh: 'high', theme: 'dark', startPage: 'performance' });
      expect(parseSettings(raw)).toEqual({
        ...DEFAULT_SETTINGS,
        refresh: 'high',
        theme: 'dark',
        startPage: 'performance',
      });
    });

    it('知らない値は既定値に戻す', () => {
      const raw = JSON.stringify({ refresh: 'turbo', theme: 'pink', startPage: 'nowhere' });
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    });

    it('一部だけ正しければその部分は使う', () => {
      expect(parseSettings(JSON.stringify({ theme: 'light' }))).toEqual({
        ...DEFAULT_SETTINGS,
        theme: 'light',
      });
    });
  });

  describe('boundary', () => {
    it.each([null, '', '{', 'null', '42', '"text"'])('壊れた入力 %j は既定値', (raw) => {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    });

    it('既定値のオブジェクトを書き換えない', () => {
      const s = parseSettings(null);
      s.theme = 'dark';
      s.detailColumns.push('exe');
      expect(DEFAULT_SETTINGS.theme).toBe('system');
      expect(DEFAULT_SETTINGS.detailColumns).not.toContain('exe');
    });

    it('オン・オフの設定は true と false だけを読み、ほかは既定値', () => {
      expect(parseSettings(JSON.stringify({ confirmEfficiency: false })).confirmEfficiency).toBe(false);
      expect(parseSettings(JSON.stringify({ confirmEfficiency: 0 })).confirmEfficiency).toBe(true);
      expect(parseSettings(JSON.stringify({ confirmEfficiency: 'false' })).confirmEfficiency).toBe(true);
    });

    it('列の幅は保存された値を読む', () => {
      const raw = JSON.stringify({ columnWidths: { 'details.pid': 90, broken: 1 } });
      expect(parseSettings(raw).columnWidths).toEqual({ 'details.pid': 90 });
    });

    it('詳細タブの列は保存された値を整えて読む', () => {
      const raw = JSON.stringify({ detailColumns: ['exe', 'unknown', 'pid', 'pid'] });
      expect(parseSettings(raw).detailColumns).toEqual(['name', 'pid', 'exe']);
    });
  });
});

describe('intervalOf', () => {
  describe('equivalence', () => {
    it.each([
      ['high', 500],
      ['normal', 1000],
      ['low', 4000],
    ] as const)('%s → %d ms', (speed, ms) => {
      expect(intervalOf(speed)).toBe(ms);
    });
  });

  describe('boundary', () => {
    it('一時停止は 0', () => {
      expect(intervalOf('paused')).toBe(0);
    });
  });
});
