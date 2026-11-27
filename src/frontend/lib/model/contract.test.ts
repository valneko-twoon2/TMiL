// バックエンドが書き出した契約（tests/contract/fixtures）をフロントの検証で受け取れるか確かめる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toKillTarget } from '../process/columns';
import {
  isAppWindows,
  isConnections,
  isHandles,
  isModules,
  isServices,
  isKillResults,
  isKillTargets,
  isProcessControls,
  isProcessIcons,
  isReplacementStatus,
  decodeProcessRow,
  isProcessDetailsList,
  isSnapshot,
  isSnapshotWire,
  isStartupEntries,
  isSystemInfo,
} from './guards';
import {
  SERVICE_ACTIONS,
  SERVICE_START_TYPES,
  SERVICE_STATUSES,
  TCP_STATES,
  type Connection,
  type ServiceInfo,
  DISK_KINDS,
  PRIORITIES,
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
      [
        'snapshot-wire',
        (v: unknown) => isSnapshotWire(v) && v.processes.every((row) => decodeProcessRow(row) !== null),
      ],
      ['process-details', isProcessDetailsList],
      ['system-info', isSystemInfo],
      ['kill-results', isKillResults],
      ['kill-targets', isKillTargets],
      ['startup-entries', isStartupEntries],
      ['replacement-status', isReplacementStatus],
      ['process-icons', isProcessIcons],
      // 見本は「読めた場合」と「読めなかった場合」の 2 つを並べている
      ['process-controls', (v: unknown) => Array.isArray(v) && v.every(isProcessControls)],
      ['app-windows', isAppWindows],
      ['services', isServices],
      ['connections', isConnections],
      ['modules', isModules],
      ['handles', isHandles],
    ] as const)('%s を受け取れる', (name, guard) => {
      expect(guard(fixture(name))).toBe(true);
    });

    it('サービスの状態・開始の種類・操作の種類が両側で一致する', () => {
      const services = fixture('services') as ServiceInfo[];
      expect(new Set(services.map((s) => s.status))).toEqual(new Set(SERVICE_STATUSES));
      expect(new Set(services.map((s) => s.startType))).toEqual(new Set(SERVICE_START_TYPES));
      expect(fixture('service-actions')).toEqual([...SERVICE_ACTIONS]);
    });

    it('TCP の状態の種類が両側で一致する', () => {
      const states = (fixture('connections') as Connection[]).map((c) => c.state).filter((s) => s !== null);
      expect(new Set(states)).toEqual(new Set(TCP_STATES));
    });

    it('優先度の種類と並びが両側で一致する', () => {
      expect(fixture('priorities')).toEqual([...PRIORITIES]);
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
