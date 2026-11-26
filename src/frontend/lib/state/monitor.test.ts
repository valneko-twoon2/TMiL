import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotFixture } from '../../test/fixtures';
import { createApi, type Invoke } from '../api/ipc';
import { Monitor } from './monitor.svelte';

/** snapshot を呼ぶたびに数え、応答は手動で返せるようにする。 */
function setup() {
  const pending: (() => void)[] = [];
  let calls = 0;
  const call: Invoke = (cmd) => {
    if (cmd !== 'snapshot') return Promise.reject(new Error(cmd));
    calls += 1;
    return new Promise((resolve) =>
      pending.push(() => {
        resolve(snapshotFixture());
      }),
    );
  };
  const monitor = new Monitor(createApi(call));
  return {
    monitor,
    calls: () => calls,
    resolveAll: async () => {
      for (const done of pending.splice(0)) done();
      await vi.runOnlyPendingTimersAsync();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Monitor', () => {
  describe('equivalence', () => {
    it('間隔ごとに取得する', async () => {
      const t = setup();
      t.monitor.setInterval(1000);
      expect(t.calls()).toBe(1);
      await t.resolveAll();
      await vi.advanceTimersByTimeAsync(1000);
      expect(t.calls()).toBe(2);
      t.monitor.stop();
    });

    it('隠れている間は取得しない', async () => {
      const t = setup();
      t.monitor.setVisible(false);
      t.monitor.setInterval(1000);
      expect(t.calls()).toBe(0);
      t.monitor.setVisible(true);
      expect(t.calls()).toBe(1);
      await t.resolveAll();
      t.monitor.stop();
    });
  });

  describe('boundary', () => {
    it('間隔 0 は一時停止', () => {
      const t = setup();
      t.monitor.setInterval(0);
      expect(t.calls()).toBe(0);
    });
  });

  describe('regression', () => {
    // 設定を変えるたびに同じ間隔で再設定され、取得が重なってグラフが跳ねていた
    it('同じ間隔を設定し直しても取得し直さない', async () => {
      const t = setup();
      t.monitor.setInterval(1000);
      t.monitor.setInterval(1000);
      expect(t.calls()).toBe(1);
      await t.resolveAll();
      t.monitor.stop();
    });

    // タスク終了後の更新が定期取得と重なり、短い間隔で 2 回取得していた
    it('取得中に refresh を呼んでも重ねて取得しない', async () => {
      const t = setup();
      t.monitor.setInterval(1000);
      const extra = t.monitor.refresh();
      expect(t.calls()).toBe(1);
      await t.resolveAll();
      await extra;
      expect(t.monitor.snapshot).not.toBeNull();
      t.monitor.stop();
    });
  });

  describe('regression', () => {
    // バックエンドが直前の結果を返したときも履歴に足し、グラフに同じ点が並んでいた
    it('同じ時刻の計測結果は履歴に 2 度足さない', async () => {
      const snap = snapshotFixture();
      const monitor = new Monitor(createApi(() => Promise.resolve(snap)));
      await monitor.refresh();
      await monitor.refresh();
      expect(monitor.history.get('cpu')).toEqual([snap.cpu.usage]);
    });
  });
});
