// 偽バックエンドのサービス・接続・モジュール・ウィンドウ・新しいタスクが契約どおりに動くか確かめる。
import { describe, expect, it } from 'vitest';
import { isAppWindows, isConnections, isModules, isServices } from '../model/guards';
import { createMockState, handleCommand } from './backend';

describe('偽のバックエンド（システム）', () => {
  describe('equivalence', () => {
    it('一覧は契約どおりの形', () => {
      const state = createMockState();
      expect(isServices(handleCommand(state, 'services'))).toBe(true);
      expect(isConnections(handleCommand(state, 'network_connections'))).toBe(true);
      expect(isAppWindows(handleCommand(state, 'app_windows'))).toBe(true);
      expect(isModules(handleCommand(state, 'process_modules', { pid: 1012 }))).toBe(true);
    });

    it('サービスを止めると PID が消え、開始すると決まった PID で動く', () => {
      const state = createMockState();
      handleCommand(state, 'control_service', { name: 'wuauserv', action: 'stop' });
      expect(state.services.find((s) => s.name === 'wuauserv')).toMatchObject({
        status: 'stopped',
        pid: null,
      });
      handleCommand(state, 'control_service', { name: 'wuauserv', action: 'start' });
      const started = state.services.find((s) => s.name === 'wuauserv');
      expect(started?.status).toBe('running');
      expect(started?.pid).toBe(2000 + 'wuauserv'.length * 4);
      handleCommand(state, 'control_service', { name: 'Themes', action: 'restart' });
      expect(state.services.find((s) => s.name === 'Themes')).toMatchObject({ status: 'running', pid: 1064 });
    });

    it('新しいタスクは入力と管理者の指定を覚え、ウィンドウの切り替えや常に手前も覚える', () => {
      const state = createMockState();
      handleCommand(state, 'run_task', { command: '  notepad a.txt ', admin: true });
      handleCommand(state, 'switch_to_window', { pid: 1012 });
      handleCommand(state, 'set_always_on_top', { enabled: true });
      handleCommand(state, 'open_services_tool');
      expect(state.launched).toEqual([{ command: 'notepad a.txt', admin: true }]);
      expect(state.switched).toEqual([1012]);
      expect(state.alwaysOnTop).toBe(true);
      expect(state.servicesToolOpened).toBe(1);
    });

    it('終了したプロセスのウィンドウと接続は消える', () => {
      const state = createMockState();
      state.killed.add(1012);
      const windows = handleCommand(state, 'app_windows') as { pid: number }[];
      const conns = handleCommand(state, 'network_connections') as { pid: number | null }[];
      expect(windows.some((w) => w.pid === 1012)).toBe(false);
      expect(conns.some((c) => c.pid === 1012)).toBe(false);
      expect(conns.some((c) => c.pid === null)).toBe(true);
    });
  });

  describe('boundary', () => {
    it('無効のサービスは開始できないが、止めるのはできる', () => {
      const state = createMockState();
      expect(() => handleCommand(state, 'control_service', { name: 'Fax', action: 'start' })).toThrow('無効');
      expect(() => handleCommand(state, 'control_service', { name: 'Fax', action: 'restart' })).toThrow(
        '無効',
      );
      expect(handleCommand(state, 'control_service', { name: 'Fax', action: 'stop' })).toBeNull();
      expect(() => handleCommand(state, 'control_service', { name: 'nope', action: 'stop' })).toThrow(
        '正しくありません',
      );
    });

    it('空のタスクと見つからないタスクはエラー', () => {
      const state = createMockState();
      expect(() => handleCommand(state, 'run_task', { command: '  ', admin: false })).toThrow('名前を入力');
      expect(() => handleCommand(state, 'run_task', { command: 'nosuchapp -x', admin: false })).toThrow(
        "'nosuchapp' が見つかりません",
      );
      expect(state.launched).toEqual([]);
    });

    it('System と知らない PID のモジュールは読めない', () => {
      const state = createMockState();
      expect(() => handleCommand(state, 'process_modules', { pid: 4 })).toThrow('モジュールを読めません');
      expect(() => handleCommand(state, 'process_modules', { pid: 99999 })).toThrow('モジュールを読めません');
    });
  });
});
