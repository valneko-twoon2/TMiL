import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { createMockState, handleCommand } from './backend';

export function installMock(): void {
  const scale = Number(new URLSearchParams(window.location.search).get('scale') ?? '1');
  const state = createMockState(Number.isFinite(scale) ? scale : 1);
  mockWindows('main');
  mockIPC((cmd, payload) => handleCommand(state, cmd, (payload ?? {}) as Record<string, unknown>), {
    shouldMockEvents: true,
  });
}
