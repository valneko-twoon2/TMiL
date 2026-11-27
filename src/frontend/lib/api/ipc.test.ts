import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ContractError, createApi, toError, type Invoke } from './ipc';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../tests/contract/fixtures/${name}.json`, import.meta.url), 'utf8'),
  );

function apiReturning(value: unknown) {
  const call = vi.fn<Invoke>(() => Promise.resolve(value));
  return { api: createApi(call), call };
}

describe('createApi', () => {
  describe('equivalence', () => {
    it('snapshot は検証済みの値を返す', async () => {
      const { api, call } = apiReturning(fixture('snapshot'));
      await expect(api.snapshot()).resolves.toMatchObject({ timestampMs: 1767225600000 });
      expect(call).toHaveBeenCalledWith('snapshot', undefined);
    });

    it('各コマンドに正しい名前と引数を渡す', async () => {
      const cases: [() => Promise<unknown>, string, unknown, unknown][] = [];
      const make = (value: unknown) => apiReturning(value);

      const a = make(fixture('system-info'));
      cases.push([() => a.api.systemInfo(), 'system_info', undefined, a.call]);
      const b = make(fixture('kill-results'));
      const targets = [
        { pid: 1, startTime: 10 },
        { pid: 2, startTime: 20 },
      ];
      cases.push([() => b.api.killProcesses(targets), 'kill_processes', { targets }, b.call]);
      const c = make(fixture('startup-entries'));
      cases.push([() => c.api.startupEntries(), 'startup_entries', undefined, c.call]);
      const d = make(null);
      cases.push([
        () => d.api.setStartupEnabled('x:y', false),
        'set_startup_enabled',
        { id: 'x:y', enabled: false },
        d.call,
      ]);
      const e = make(fixture('replacement-status'));
      cases.push([() => e.api.taskmgrReplacement(), 'taskmgr_replacement', undefined, e.call]);
      const f = make(fixture('replacement-status'));
      cases.push([
        () => f.api.setTaskmgrReplacement(true),
        'set_taskmgr_replacement',
        { enabled: true },
        f.call,
      ]);

      for (const [run, name, args, call] of cases) {
        await run();
        expect(call).toHaveBeenCalledWith(name, args);
      }
    });

    it('形の違う応答は ContractError にする', async () => {
      const { api } = apiReturning({ wrong: true });
      await expect(api.snapshot()).rejects.toBeInstanceOf(ContractError);
    });

    it('バックエンドのエラー文を Error にして投げ直す', async () => {
      const api = createApi(() => Promise.reject(new Error('dummy')));
      await expect(api.startupEntries()).rejects.toThrow('dummy');
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Tauri のコマンドはエラーを文字列で返す
      const api2 = createApi(() => Promise.reject('権限がありません'));
      await expect(api2.startupEntries()).rejects.toThrow('権限がありません');
    });
  });

  describe('boundary', () => {
    it('文字列でも Error でもない失敗は「不明なエラー」', () => {
      expect(toError(42).message).toBe('不明なエラーが発生しました');
      expect(toError(undefined).message).toBe('不明なエラーが発生しました');
    });

    it('空の PID 一覧もそのまま渡す', async () => {
      const { api, call } = apiReturning([]);
      await expect(api.killProcesses([])).resolves.toEqual([]);
      expect(call).toHaveBeenCalledWith('kill_processes', { targets: [] });
    });
  });
});

describe('createApi（新しいコマンド）', () => {
  describe('equivalence', () => {
    it('アイコン・ファイルの場所・優先度・関係・検索に正しい名前と引数を渡す', async () => {
      const target = { pid: 1, startTime: 10 };
      const cases: [unknown, (api: ReturnType<typeof createApi>) => Promise<unknown>, string, unknown][] = [
        [
          fixture('process-icons'),
          (api) => api.processIcons(['a.exe']),
          'process_icons',
          { exes: ['a.exe'] },
        ],
        [null, (api) => api.revealFile('C:\\a.exe'), 'reveal_file', { path: 'C:\\a.exe' }],
        [
          fixture('kill-results'),
          (api) => api.setProcessPriority([target], 'high'),
          'set_process_priority',
          { targets: [target], priority: 'high' },
        ],
        [
          fixture('kill-results'),
          (api) => api.setProcessAffinity([target], [0, 2]),
          'set_process_affinity',
          { targets: [target], cpus: [0, 2] },
        ],
        [{ priority: 'low', affinity: [0] }, (api) => api.processControls(7), 'process_controls', { pid: 7 }],
        [null, (api) => api.searchOnline('chrome.exe'), 'search_online', { query: 'chrome.exe' }],
        [
          fixture('kill-results'),
          (api) => api.suspendProcesses([target]),
          'suspend_processes',
          { targets: [target] },
        ],
        [
          fixture('kill-results'),
          (api) => api.resumeProcesses([target]),
          'resume_processes',
          { targets: [target] },
        ],
        [
          fixture('kill-results'),
          (api) => api.setProcessEfficiency([target], true),
          'set_process_efficiency',
          { targets: [target], enabled: true },
        ],
      ];
      for (const [value, run, name, args] of cases) {
        const { api, call } = apiReturning(value);
        await run(api);
        expect(call).toHaveBeenCalledWith(name, args);
      }
    });

    it('契約と違う応答のエラーには、コマンド名と種類が入る', async () => {
      const { api } = apiReturning({ wrong: true });
      const error = await api.processIcons([]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ContractError);
      expect((error as Error).name).toBe('ContractError');
      expect((error as Error).message).toBe('process_icons の応答が想定と違います');
    });
  });
});
