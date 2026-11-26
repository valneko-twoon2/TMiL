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
      cases.push([() => b.api.killProcesses([1, 2]), 'kill_processes', { pids: [1, 2] }, b.call]);
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
      expect(call).toHaveBeenCalledWith('kill_processes', { pids: [] });
    });
  });
});
