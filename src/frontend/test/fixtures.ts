// テスト用: バックエンドが書き出した契約 JSON（tests/contract/fixtures）を読む。
import { readFileSync } from 'node:fs';
import type { Snapshot, StartupEntry, SystemInfo } from '../lib/model/types';

export function readFixture(name: string): unknown {
  const url = new URL(`../../../tests/contract/fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

export const snapshotFixture = (): Snapshot => readFixture('snapshot') as Snapshot;
export const systemInfoFixture = (): SystemInfo => readFixture('system-info') as SystemInfo;
export const startupFixture = (): StartupEntry[] => readFixture('startup-entries') as StartupEntry[];
