// IPC で受け取った値が契約どおりの形かを実行時に確かめる。
import {
  DISK_KINDS,
  PROCESS_STATES,
  STARTUP_LOCATIONS,
  type CpuStats,
  type DiskStats,
  type KillResult,
  type KillTarget,
  type MemoryStats,
  type NetworkStats,
  type ProcessInfo,
  type ReplacementStatus,
  type Snapshot,
  type StartupEntry,
  type SystemInfo,
} from './types';

type Guard<T> = (value: unknown) => value is T;
type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPercent = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 100;
const nullable =
  <T>(g: Guard<T>): Guard<T | null> =>
  (v: unknown): v is T | null =>
    v === null || g(v);
const arrayOf =
  <T>(g: Guard<T>): Guard<T[]> =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every(g);
const oneOf =
  <T extends string>(values: readonly T[]): Guard<T> =>
  (v: unknown): v is T =>
    isStr(v) && (values as readonly string[]).includes(v);

/** 各キーにガードを当てる。余分なキーは許す（後方互換のため）。 */
function shape<T>(spec: Record<keyof T & string, Guard<unknown>>): Guard<T> {
  return (v: unknown): v is T =>
    isRecord(v) && Object.entries<Guard<unknown>>(spec).every(([key, guard]) => guard(v[key]));
}

export const isCpuStats = shape<CpuStats>({
  usage: isPercent,
  perCore: arrayOf(isPercent),
  frequencyMhz: isCount,
  processCount: isCount,
  uptimeSecs: isCount,
});

export const isMemoryStats = shape<MemoryStats>({
  total: isCount,
  used: isCount,
  available: isCount,
  swapTotal: isCount,
  swapUsed: isCount,
});

export const isDiskStats = shape<DiskStats>({
  name: isStr,
  mountPoint: isStr,
  fileSystem: isStr,
  kind: oneOf(DISK_KINDS),
  removable: isBool,
  total: isCount,
  available: isCount,
  readPerSec: isCount,
  writtenPerSec: isCount,
});

export const isNetworkStats = shape<NetworkStats>({
  name: isStr,
  receivedPerSec: isCount,
  transmittedPerSec: isCount,
  totalReceived: isCount,
  totalTransmitted: isCount,
});

export const isProcessInfo = shape<ProcessInfo>({
  pid: isCount,
  parentPid: nullable(isCount),
  name: isStr,
  exe: isStr,
  command: isStr,
  state: oneOf(PROCESS_STATES),
  user: isStr,
  cpu: isPercent,
  memory: isCount,
  diskReadPerSec: isCount,
  diskWrittenPerSec: isCount,
  runTimeSecs: isCount,
  startTime: isCount,
});

export const isSnapshot = shape<Snapshot>({
  timestampMs: isCount,
  cpu: isCpuStats,
  memory: isMemoryStats,
  disks: arrayOf(isDiskStats),
  networks: arrayOf(isNetworkStats),
  processes: arrayOf(isProcessInfo),
});

export const isSystemInfo = shape<SystemInfo>({
  osName: isStr,
  osVersion: isStr,
  kernelVersion: isStr,
  hostName: isStr,
  cpuBrand: isStr,
  physicalCores: nullable(isCount),
  logicalCores: isCount,
});

export const isKillResult = shape<KillResult>({
  pid: isCount,
  ok: isBool,
  error: nullable(isStr),
});
export const isKillResults = arrayOf(isKillResult);

export const isKillTarget = shape<KillTarget>({ pid: isCount, startTime: isCount });
export const isKillTargets = arrayOf(isKillTarget);

export const isStartupEntry = shape<StartupEntry>({
  id: isStr,
  name: isStr,
  command: isStr,
  program: isStr,
  location: oneOf(STARTUP_LOCATIONS),
  enabled: isBool,
  canToggle: isBool,
});
export const isStartupEntries = arrayOf(isStartupEntry);

export const isReplacementStatus = shape<ReplacementStatus>({
  supported: isBool,
  replaced: isBool,
  other: nullable(isStr),
});

/** `null` を返すコマンド用。 */
export const isNull = (v: unknown): v is null => v === null;
