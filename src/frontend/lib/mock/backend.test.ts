// E2E・VRT で使う偽のバックエンドが、契約どおりの値を返すか確かめる。
import { describe, expect, it } from 'vitest';
import { createApi } from '../api/ipc';
import { isProcessIcons, isSnapshot } from '../model/guards';
import { createMockState, handleCommand, mockIcon, type MockState } from './backend';

/** 本物と同じく、ipc.ts を通して計測結果を受け取る（配列と詳細を合わせた形になる）。 */
const snapshotOf = (state: MockState) =>
  createApi((cmd, args) => Promise.resolve(handleCommand(state, cmd, args ?? {}))).snapshot();

describe('偽のバックエンド', () => {
  describe('equivalence', () => {
    it('計測結果とアイコンは契約どおり', async () => {
      const state = createMockState();
      const snapshot = await snapshotOf(state);
      expect(isSnapshot(snapshot)).toBe(true);
      const icons = handleCommand(state, 'process_icons', { exes: ['C:\\a\\app.exe', ''] });
      expect(isProcessIcons(icons)).toBe(true);
    });

    it('ファイルの場所を開くと、渡された場所を覚える', () => {
      const state = createMockState();
      expect(handleCommand(state, 'reveal_file', { path: 'C:\\a\\app.exe' })).toBeNull();
      expect(state.revealed).toEqual(['C:\\a\\app.exe']);
    });
  });

  describe('boundary', () => {
    it('プロセスの数を倍にでき、PID は重ならず System は 1 つだけ。1 未満は 1 倍', async () => {
      const count = async (scale: number) => (await snapshotOf(createMockState(scale))).processes;
      const one = await count(1);
      const ten = await count(10);
      expect(ten.length).toBe(one.length * 10 - 9);
      expect(new Set(ten.map((p) => p.pid)).size).toBe(ten.length);
      expect(ten.filter((p) => p.name === 'System')).toHaveLength(1);
      expect(ten.some((p) => p.name === 'chrome-9.exe')).toBe(true);
      expect(await count(0)).toHaveLength(one.length);
    });

    it('場所が分からない実行ファイルにはアイコンが無い', () => {
      expect(mockIcon('')).toBeNull();
    });

    it('知らないコマンドや空の場所はエラー', () => {
      const state = createMockState();
      expect(() => handleCommand(state, 'unknown')).toThrow('未対応のコマンド');
      expect(() => handleCommand(state, 'reveal_file', { path: '' })).toThrow();
    });
  });

  describe('regression', () => {
    // String.raw の中の \${...} が置き換わらず、全プロセスの実行ファイルが同じ文字列になっていた
    it('実行ファイルの場所はプロセス名ごとに違い、名前で終わる', async () => {
      const snapshot = await snapshotOf(createMockState());
      const withExe = snapshot.processes.filter((p) => p.exe !== '');
      for (const p of withExe) expect(p.exe.endsWith(`\\${p.name}`)).toBe(true);
      const names = new Set(withExe.map((p) => p.name));
      expect(new Set(withExe.map((p) => p.exe)).size).toBe(names.size);
      expect(new Set(withExe.map((p) => mockIcon(p.exe))).size).toBeGreaterThan(1);
    });
  });
});
