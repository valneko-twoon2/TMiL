import { describe, expect, it } from 'vitest';
import { snapshotFixture } from '../../test/fixtures';
import { diskKeys, EMPTY_HISTORY, historyKey, pushValue, recordSnapshot } from './history';

const snapshot = snapshotFixture();

describe('pushValue', () => {
  describe('equivalence', () => {
    it('末尾に足す（元の配列は変えない）', () => {
      const base = [1, 2];
      expect(pushValue(base, 3, 5)).toEqual([1, 2, 3]);
      expect(base).toEqual([1, 2]);
    });
  });

  describe('boundary', () => {
    it('容量ちょうどまでは捨てない', () => {
      expect(pushValue([1, 2], 3, 3)).toEqual([1, 2, 3]);
    });

    it('容量を超えたら古いものから捨てる', () => {
      expect(pushValue([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    });

    it('容量 0 以下なら空', () => {
      expect(pushValue([1], 2, 0)).toEqual([]);
    });

    it('数値でない値は 0 として記録する', () => {
      expect(pushValue([], Number.NaN, 3)).toEqual([0]);
    });
  });
});

describe('diskKeys', () => {
  describe('regression', () => {
    // 名前の同じディスク（ラベルなしの C: と D: など）で履歴と ID が重なり、別のディスクのグラフが出ていた
    it('名前が同じでもマウントポイントで区別する', () => {
      const [a, b] = snapshot.disks;
      if (!a || !b) throw new Error('fixture');
      const disks = [
        { ...a, name: '', mountPoint: 'C:\\' },
        { ...b, name: '', mountPoint: 'D:\\' },
      ];
      expect(diskKeys(disks)).toEqual(['C:\\', 'D:\\']);
      const h = recordSnapshot(EMPTY_HISTORY, { ...snapshot, disks });
      expect(h.get(historyKey.diskRead('C:\\'))).toEqual([a.readPerSec]);
      expect(h.get(historyKey.diskRead('D:\\'))).toEqual([b.readPerSec]);
    });

    it('マウントポイントまで同じなら番号を付けて区別する', () => {
      const [a] = snapshot.disks;
      if (!a) throw new Error('fixture');
      expect(diskKeys([a, a, a])).toEqual([a.mountPoint, `${a.mountPoint}#1`, `${a.mountPoint}#2`]);
    });
  });
});

describe('recordSnapshot', () => {
  describe('equivalence', () => {
    it('CPU・メモリ・ディスク・ネットワークを記録する', () => {
      const h = recordSnapshot(EMPTY_HISTORY, snapshot);
      expect(h.get(historyKey.cpu)).toEqual([25.5]);
      expect(h.get(historyKey.memory)).toEqual([50]);
      expect(h.get(historyKey.diskRead('/'))).toEqual([4096]);
      expect(h.get(historyKey.diskWrite('/'))).toEqual([1024]);
      expect(h.get(historyKey.netReceive('eth0'))).toEqual([1000]);
      expect(h.get(historyKey.netTransmit('eth0'))).toEqual([200]);
    });

    it('前回の履歴に続けて記録する', () => {
      const once = recordSnapshot(EMPTY_HISTORY, snapshot);
      const twice = recordSnapshot(once, snapshot);
      expect(twice.get(historyKey.cpu)).toEqual([25.5, 25.5]);
    });
  });

  describe('boundary', () => {
    it('消えたディスクの履歴は捨てる', () => {
      const once = recordSnapshot(EMPTY_HISTORY, snapshot);
      const next = recordSnapshot(once, { ...snapshot, disks: [] });
      expect(next.has(historyKey.diskRead('/'))).toBe(false);
    });

    it('容量を指定できる', () => {
      let h = recordSnapshot(EMPTY_HISTORY, snapshot, 2);
      h = recordSnapshot(h, snapshot, 2);
      h = recordSnapshot(h, snapshot, 2);
      expect(h.get(historyKey.cpu)).toHaveLength(2);
    });
  });
});
