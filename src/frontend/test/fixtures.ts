// テスト用: バックエンドが書き出した契約 JSON（tests/contract/fixtures）を読む。
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import type { Invoke } from '../lib/api/ipc';
import { encodeProcessRow } from '../lib/model/guards';
import type { ProcessInfo, Snapshot, StartupEntry, SystemInfo } from '../lib/model/types';
import { detailsOf, encodeSnapshot } from '../lib/model/wire';

export function readFixture(name: string): unknown {
  const url = new URL(`../../../tests/contract/fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

export const snapshotFixture = (): Snapshot => readFixture('snapshot') as Snapshot;
/** バックエンドの代わりに、計測結果を送る形（配列と詳細）で返す。ほかのコマンドは `other` に任せる。 */
export function snapshotInvoke(snapshot: () => Snapshot, other?: Invoke): Invoke {
  return (cmd, args) => {
    if (cmd === 'snapshot') return Promise.resolve(encodeSnapshot(snapshot(), encodeProcessRow));
    if (cmd === 'process_details') {
      const pids = Array.isArray(args?.pids) ? (args.pids as unknown[]) : [];
      return Promise.resolve(detailsOf(snapshot().processes, pids));
    }
    return other ? other(cmd, args) : Promise.reject(new Error(cmd));
  };
}

export const systemInfoFixture = (): SystemInfo => readFixture('system-info') as SystemInfo;
export const startupFixture = (): StartupEntry[] => readFixture('startup-entries') as StartupEntry[];

type ProcessExtras = Pick<
  ProcessInfo,
  | 'virtualMemory'
  | 'cpuTimeMs'
  | 'diskReadTotal'
  | 'diskWrittenTotal'
  | 'handles'
  | 'threads'
  | 'sessionId'
  | 'gpu'
  | 'gpuMemory'
  | 'gpuEngine'
  | 'efficient'
  | 'appContainer'
>;

/** テストで作るプロセスの、ふだんは気にしない項目。 */
export const PROCESS_EXTRAS: ProcessExtras = {
  virtualMemory: 0,
  cpuTimeMs: 0,
  diskReadTotal: 0,
  diskWrittenTotal: 0,
  handles: null,
  threads: null,
  sessionId: null,
  gpu: null,
  gpuMemory: null,
  gpuEngine: null,
  efficient: false,
  appContainer: false,
};

/** fast-check 用: 上の項目をばらばらに作る。 */
export const processExtrasArb = {
  virtualMemory: fc.nat(),
  cpuTimeMs: fc.nat(),
  diskReadTotal: fc.nat(),
  diskWrittenTotal: fc.nat(),
  handles: fc.option(fc.nat(), { nil: null }),
  threads: fc.option(fc.nat(), { nil: null }),
  sessionId: fc.option(fc.nat(), { nil: null }),
  gpu: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
  gpuMemory: fc.option(fc.nat(), { nil: null }),
  gpuEngine: fc.option(fc.constantFrom('GPU 0 - 3D', 'GPU 0 - Copy'), { nil: null }),
  efficient: fc.boolean(),
  appContainer: fc.boolean(),
};
