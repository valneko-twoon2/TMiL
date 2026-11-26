// モック版ビルドで偽バックエンドを差し込む。
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { createMockState, handleCommand } from './backend';

export function installMock(): void {
  const state = createMockState();
  mockWindows('main');
  mockIPC((cmd, payload) => handleCommand(state, cmd, (payload ?? {}) as Record<string, unknown>), {
    shouldMockEvents: true,
  });
}
