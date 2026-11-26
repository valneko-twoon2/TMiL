import { describe, expect, it } from 'vitest';
import {
  formatBits,
  formatBytes,
  formatDateTime,
  formatFrequency,
  formatPercent,
  formatRate,
  formatUptime,
} from './format';
import { heatLevel, rateLevel, shareOf } from './heat';
import { processStateLabel, processStatusBadge, startupLocationLabel } from './labels';

describe('formatBytes', () => {
  describe('equivalence', () => {
    it.each([
      [512, '512 B'],
      [1536, '1.5 KB'],
      [5 * 1024 ** 2, '5.0 MB'],
      [3.25 * 1024 ** 3, '3.3 GB'],
    ])('%d → %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });

    it('毎秒の表記', () => {
      expect(formatRate(2048)).toBe('2.0 KB/秒');
    });
  });

  describe('boundary', () => {
    it.each([
      [0, '0 B'],
      [-1, '0 B'],
      [Number.NaN, '0 B'],
      [1023, '1023 B'],
      [1024, '1.0 KB'],
      [1024 ** 6, '1024.0 PB'],
    ])('%d → %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });
  });
});

describe('formatPercent', () => {
  describe('equivalence', () => {
    it('小数 1 桁で表す', () => {
      expect(formatPercent(12.345)).toBe('12.3%');
      expect(formatPercent(12.345, 0)).toBe('12%');
    });
  });

  describe('boundary', () => {
    it.each([
      [0, '0.0%'],
      [-5, '0.0%'],
      [Number.NaN, '0.0%'],
      [100, '100.0%'],
      [150, '100.0%'],
    ])('%d → %s', (input, expected) => {
      expect(formatPercent(input)).toBe(expected);
    });
  });
});

describe('formatUptime', () => {
  describe('equivalence', () => {
    it('日:時:分:秒', () => {
      expect(formatUptime(93784)).toBe('1:02:03:04');
    });
  });

  describe('boundary', () => {
    it.each([
      [0, '0:00:00:00'],
      [59, '0:00:00:59'],
      [60, '0:00:01:00'],
      [86399, '0:23:59:59'],
      [86400, '1:00:00:00'],
      [-1, '0:00:00:00'],
      [Number.NaN, '0:00:00:00'],
    ])('%d → %s', (input, expected) => {
      expect(formatUptime(input)).toBe(expected);
    });
  });
});

describe('formatDateTime', () => {
  describe('equivalence', () => {
    it('その PC の時刻で年/月/日 時:分:秒', () => {
      const secs = new Date(2026, 0, 2, 3, 4, 5).getTime() / 1000;
      expect(formatDateTime(secs)).toBe('2026/01/02 03:04:05');
    });
  });

  describe('boundary', () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('%s は空', (v) => {
      expect(formatDateTime(v)).toBe('');
    });
  });
});

describe('formatFrequency / formatBits', () => {
  describe('equivalence', () => {
    it('MHz を GHz に', () => {
      expect(formatFrequency(3200)).toBe('3.20 GHz');
    });

    it('バイトをビットに', () => {
      expect(formatBits(100)).toBe('800 bps');
      expect(formatBits(1250)).toBe('10.0 Kbps');
      expect(formatBits(125_000_000)).toBe('1.0 Gbps');
    });
  });

  describe('boundary', () => {
    it('0 以下は表示しない / 0 bps', () => {
      expect(formatFrequency(0)).toBe('-');
      expect(formatBits(0)).toBe('0 bps');
      expect(formatBits(-1)).toBe('0 bps');
      expect(formatBits(Number.NaN)).toBe('0 bps');
    });

    it('999 bps と 1000 bps の境目', () => {
      expect(formatBits(124.875)).toBe('999 bps');
      expect(formatBits(125)).toBe('1.0 Kbps');
    });
  });
});

describe('heatLevel / rateLevel / shareOf', () => {
  describe('equivalence', () => {
    it.each([
      [2, 1],
      [10, 2],
      [30, 3],
      [60, 4],
      [90, 5],
    ])('%d%% → 段階 %d', (percent, level) => {
      expect(heatLevel(percent)).toBe(level);
    });

    it('割合を求める', () => {
      expect(shareOf(25, 100)).toBe(25);
    });
  });

  describe('boundary', () => {
    it.each([
      [0, 0],
      [0.49, 0],
      [0.5, 1],
      [4.99, 1],
      [5, 2],
      [20, 3],
      [50, 4],
      [80, 5],
      [Number.NaN, 0],
    ])('%d%% → 段階 %d', (percent, level) => {
      expect(heatLevel(percent)).toBe(level);
    });

    it.each([
      [0, 0],
      [0.1 * 1024 ** 2 - 1, 0],
      [0.1 * 1024 ** 2, 1],
      [1024 ** 2, 2],
      [10 * 1024 ** 2, 3],
      [50 * 1024 ** 2, 4],
      [200 * 1024 ** 2, 5],
      [Number.NaN, 0],
    ])('%d B/秒 → 段階 %d', (rate, level) => {
      expect(rateLevel(rate)).toBe(level);
    });

    it('全体が 0 や部分が負なら 0、超えたら 100', () => {
      expect(shareOf(1, 0)).toBe(0);
      expect(shareOf(-1, 10)).toBe(0);
      expect(shareOf(20, 10)).toBe(100);
      expect(shareOf(Number.NaN, 10)).toBe(0);
    });
  });
});

describe('labels', () => {
  describe('equivalence', () => {
    it('状態名', () => {
      expect(processStateLabel('running')).toBe('実行中');
      expect(processStateLabel('other')).toBe('');
    });

    it('プロセス タブは中断と終了済みだけ表示する', () => {
      expect(processStatusBadge('running')).toBe('');
      expect(processStatusBadge('sleeping')).toBe('');
      expect(processStatusBadge('stopped')).toBe('中断');
      expect(processStatusBadge('zombie')).toBe('終了済み');
    });

    it('スタートアップの場所', () => {
      expect(startupLocationLabel('registryUser')).toBe('レジストリ（ユーザー）');
      expect(startupLocationLabel('autostartSystem')).toBe('autostart（システム）');
    });
  });

  describe('regression', () => {
    // 終了済み（ゾンビ）のプロセスを「応答なし」と表示し、固まったアプリと紛らわしかった
    it('終了済みのプロセスを「応答なし」と表示しない', () => {
      expect(processStateLabel('zombie')).not.toBe('応答なし');
      expect(processStatusBadge('zombie')).not.toBe('応答なし');
    });
  });
});
