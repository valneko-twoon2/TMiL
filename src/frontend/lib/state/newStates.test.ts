// 新しいページの状態（新しいタスク・サービス・ウィンドウの一覧・アプリの履歴・リソース モニター）。
import { describe, expect, it, vi } from 'vitest';
import { readFixture, snapshotFixture } from '../../test/fixtures';
import type { Api } from '../api/ipc';
import { APP_HISTORY_STORAGE_KEY } from '../history/appHistory';
import type { HandleInfo, ModuleInfo, ServiceInfo, Snapshot } from '../model/types';
import { AppHistoryStore } from './appHistory.svelte';
import { AppWindows } from './appWindows.svelte';
import { ResourceMonitorState } from './resmon.svelte';
import { RunTask } from './runTask.svelte';
import { ServiceList } from './services.svelte';
import { Toasts } from './toast.svelte';

const services = () => readFixture('services') as ServiceInfo[];

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => {
      data.delete(k);
    },
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('新しいタスクの実行', () => {
  describe('equivalence', () => {
    it('起動できたら閉じて入力を消し、失敗したら理由を出したままにする', async () => {
      const runTask = vi.fn((command: string) =>
        command === 'bad' ? Promise.reject(new Error("'bad' が見つかりません。")) : Promise.resolve(),
      );
      const state = new RunTask({ runTask });
      state.show();
      state.command = 'bad';
      await state.submit();
      expect(state.open).toBe(true);
      expect(state.error).toBe("'bad' が見つかりません。");
      state.command = 'notepad';
      state.admin = true;
      await state.submit();
      expect(runTask).toHaveBeenLastCalledWith('notepad', true);
      expect(state.open).toBe(false);
      expect(state.command).toBe('');
      expect(state.admin).toBe(false);
    });
  });

  describe('boundary', () => {
    it('起動中は重ねて送らず、閉じると理由を消す', async () => {
      let finish: () => void = () => undefined;
      const runTask = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const state = new RunTask({ runTask });
      state.command = 'x';
      const first = state.submit();
      await state.submit();
      expect(runTask).toHaveBeenCalledTimes(1);
      finish();
      await first;
      state.error = 'old';
      state.close();
      expect(state.error).toBeNull();
    });
  });
});

describe('サービスの一覧', () => {
  function setup(fail = false) {
    const api = {
      services: vi.fn(() => (fail ? Promise.reject(new Error('読めません')) : Promise.resolve(services()))),
      controlService: vi.fn((name: string) =>
        name === 'svc1' ? Promise.reject(new Error('操作できません')) : Promise.resolve(),
      ),
      openServicesTool: vi.fn(() => Promise.reject(new Error('Windows でだけ開けます'))),
    } satisfies Pick<Api, 'services' | 'controlService' | 'openServicesTool'>;
    const toasts = new Toasts();
    return { list: new ServiceList(api, toasts), api, toasts };
  }

  describe('equivalence', () => {
    it('読み込み・操作・失敗の知らせ', async () => {
      const { list, api, toasts } = setup();
      await list.load();
      expect(list.loaded).toBe(true);
      expect(list.list).toHaveLength(services().length);
      const first = list.list[0];
      if (!first) throw new Error('fixture');
      await list.control(first, 'stop');
      expect(api.controlService).toHaveBeenCalledWith('svc0', 'stop');
      expect(toasts.items.at(-1)?.text).toContain('を停止しました');
      expect(api.services).toHaveBeenCalledTimes(2);
      const second = list.list[1];
      if (!second) throw new Error('fixture');
      await list.control(second, 'start');
      expect(toasts.items.at(-1)).toMatchObject({ text: '操作できません', kind: 'error' });
      await list.openTool();
      expect(toasts.items.at(-1)?.text).toBe('Windows でだけ開けます');
    });
  });

  describe('boundary', () => {
    it('読めなければ理由を覚え、読み込み中に頼まれても 1 回だけ読む', async () => {
      const { list, api } = setup(true);
      await Promise.all([list.load(), list.load()]);
      expect(api.services).toHaveBeenCalledTimes(1);
      expect(list.error).toBe('読めません');
      expect(list.loaded).toBe(true);
    });
  });
});

describe('ウィンドウの一覧', () => {
  describe('equivalence', () => {
    it('PID とタイトルを覚え、読めなければ前のままにする', async () => {
      let fail = false;
      const windows = new AppWindows({
        appWindows: () =>
          fail ? Promise.reject(new Error('x')) : Promise.resolve([{ pid: 5, title: 'メモ帳' }]),
      });
      await windows.refresh();
      expect(windows.pids.has(5)).toBe(true);
      expect(windows.titles.get(5)).toBe('メモ帳');
      fail = true;
      await windows.refresh();
      expect(windows.pids.has(5)).toBe(true);
    });
  });
});

describe('アプリの履歴の保存', () => {
  const later = (s: Snapshot, ms: number, add: number): Snapshot => ({
    ...s,
    timestampMs: s.timestampMs + ms,
    processes: s.processes.map((p) => ({ ...p, cpuTimeMs: p.cpuTimeMs + add })),
  });

  describe('equivalence', () => {
    it('10 回ごとに保存し、削除すると今から数え直して保存する', () => {
      const storage = memoryStorage();
      const store = new AppHistoryStore(storage, 7);
      expect(store.since).toBe(7);
      const s = snapshotFixture();
      for (let i = 0; i < 9; i += 1) store.record(later(s, i * 1000, i * 10));
      expect(storage.getItem(APP_HISTORY_STORAGE_KEY)).toBeNull();
      store.record(later(s, 9000, 90));
      expect(storage.getItem(APP_HISTORY_STORAGE_KEY)).not.toBeNull();
      expect(store.rows.some((r) => r.cpuMs > 0)).toBe(true);
      store.clear(99);
      expect(store.since).toBe(99);
      expect(store.rows.every((r) => r.cpuMs === 0)).toBe(true);
      expect(new AppHistoryStore(storage, 0).since).toBe(99);
    });
  });
});

describe('リソース モニターの状態', () => {
  function setup() {
    const api = {
      networkConnections: vi.fn(() => Promise.resolve(readFixture('connections') as never)),
      processModules: vi.fn((pid: number) =>
        pid === 1
          ? Promise.reject(new Error('モジュールを読めませんでした'))
          : Promise.resolve(readFixture('modules') as ModuleInfo[]),
      ),
      findHandles: vi.fn((query: string) =>
        query.includes('nosuch')
          ? Promise.reject(new Error(`'${query}' が見つかりません。`))
          : Promise.resolve(readFixture('handles') as HandleInfo[]),
      ),
    } satisfies Pick<Api, 'networkConnections' | 'processModules' | 'findHandles'>;
    return { state: new ResourceMonitorState(api), api };
  }

  describe('equivalence', () => {
    it('平均 CPU を覚え、チェックしたプロセスの合計の推移を作る', () => {
      const { state } = setup();
      const s = snapshotFixture();
      state.record(s);
      const first = s.processes[0];
      if (!first) throw new Error('fixture');
      expect(state.average(first.pid)).toBe(first.cpu);
      state.toggle(first.pid, true);
      state.record({ ...s, timestampMs: s.timestampMs + 1000 });
      expect(state.selectedHistory).toEqual([first.cpu]);
      state.toggle(first.pid, false);
      expect(state.checked.size).toBe(0);
      expect(state.selectedHistory).toEqual([]);
    });

    it('終了したプロセスはチェックから外す', () => {
      const { state } = setup();
      state.toggle(424242, true);
      state.record(snapshotFixture());
      expect(state.checked.has(424242)).toBe(false);
    });

    it('ハンドルを探し、見つからなければ理由を残す', async () => {
      const { state, api } = setup();
      await state.searchHandles('  report.docx ');
      expect(api.findHandles).toHaveBeenCalledWith('report.docx');
      expect(state.handlesQuery).toBe('report.docx');
      expect(state.handles.length).toBe(2);
      expect(state.searchingHandles).toBe(false);
      await state.searchHandles('nosuch');
      expect(state.handles).toEqual([]);
      expect(state.handlesError).toContain('見つかりません');
    });

    it('接続とモジュールを読み、読めなかったものは理由を残す', async () => {
      const { state } = setup();
      await state.refreshConnections();
      expect(state.connections.length).toBeGreaterThan(0);
      const s = snapshotFixture();
      await state.loadModules(s.processes.slice(0, 2));
      expect(state.modules[0]?.error).toBe('モジュールを読めませんでした');
      expect(state.modules[1]?.modules.length).toBeGreaterThan(0);
    });
  });

  describe('boundary', () => {
    it('空の文字では探さず、結果を消す', async () => {
      const { state, api } = setup();
      await state.searchHandles('a');
      await state.searchHandles('   ');
      expect(api.findHandles).toHaveBeenCalledTimes(1);
      expect(state.handles).toEqual([]);
      expect(state.handlesQuery).toBe('');
    });

    it('後から始めた検索の結果だけを残す', async () => {
      const slow: { resolve: (v: HandleInfo[]) => void }[] = [];
      const state = new ResourceMonitorState({
        networkConnections: () => Promise.resolve([]),
        processModules: () => Promise.resolve([]),
        findHandles: (query) =>
          query === 'old'
            ? new Promise((resolve) => slow.push({ resolve }))
            : Promise.resolve([{ pid: 2, path: 'new' }]),
      });
      const first = state.searchHandles('old');
      await state.searchHandles('new');
      slow[0]?.resolve([{ pid: 1, path: 'old' }]);
      await first;
      expect(state.handles).toEqual([{ pid: 2, path: 'new' }]);
      expect(state.searchingHandles).toBe(false);
    });

    it('接続の一覧が読めなければ理由を覚える', async () => {
      const state = new ResourceMonitorState({
        networkConnections: () => Promise.reject(new Error('netstat を起動できません')),
        processModules: () => Promise.resolve([]),
        findHandles: () => Promise.resolve([]),
      });
      await Promise.all([state.refreshConnections(), state.refreshConnections()]);
      expect(state.connectionsError).toBe('netstat を起動できません');
    });
  });
});
