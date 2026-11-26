// バックエンドが書き出した契約（tests/contract/fixtures）をフロントの検証で受け取れるか確かめる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toKillTarget } from '../process/columns';
import {
  isKillResults,
  isKillTargets,
  isProcessIcons,
  isReplacementStatus,
  isSnapshot,
  isStartupEntries,
  isSystemInfo,
} from './guards';
import {
  DISK_KINDS,
  PROCESS_STATES,
  STARTUP_LOCATIONS,
  type KillTarget,
  type Snapshot,
  type StartupEntry,
} from './types';

function fixture(name: string): unknown {
  const url = new URL(`../../../../tests/contract/fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

describe('バックエンドとの契約', () => {
  describe('contract', () => {
    it.each([
      ['snapshot', isSnapshot],
      ['system-info', isSystemInfo],
      ['kill-results', isKillResults],
      ['kill-targets', isKillTargets],
      ['startup-entries', isStartupEntries],
      ['replacement-status', isReplacementStatus],
      ['process-icons', isProcessIcons],
    ] as const)('%s を受け取れる', (name, guard) => {
      expect(guard(fixture(name))).toBe(true);
    });

    it('プロセス状態の種類が両側で一致する', () => {
      const states = (fixture('snapshot') as Snapshot).processes.map((p) => p.state);
      expect(new Set(states)).toEqual(new Set(PROCESS_STATES));
    });

    it('ディスク種別の種類が両側で一致する', () => {
      const kinds = (fixture('snapshot') as Snapshot).disks.map((d) => d.kind);
      expect(new Set(kinds)).toEqual(new Set(DISK_KINDS));
    });

    it('スタートアップの場所の種類が両側で一致する', () => {
      const locations = (fixture('startup-entries') as StartupEntry[]).map((e) => e.location);
      expect(new Set(locations)).toEqual(new Set(STARTUP_LOCATIONS));
    });

    it('フロントが送る終了の指定はバックの見本と同じ形', () => {
      const process = (fixture('snapshot') as Snapshot).processes[0];
      if (!process) throw new Error('fixture');
      const expected = (fixture('kill-targets') as KillTarget[])[0];
      expect(Object.keys(toKillTarget(process)).sort()).toEqual(Object.keys(expected ?? {}).sort());
    });

    it('キーが欠けた応答は受け取らない', () => {
      const broken = structuredClone(fixture('snapshot')) as Record<string, unknown>;
      delete broken.memory;
      expect(isSnapshot(broken)).toBe(false);
    });
  });
});
