// IPC で受け取った値が契約どおりの形かを実行時に確かめる。
import {
  type AppWindow,
  type Connection,
  type HandleInfo,
  type ModuleInfo,
  PROTOCOLS,
  SERVICE_START_TYPES,
  SERVICE_STATUSES,
  type ServiceInfo,
  TCP_STATES,
  DISK_KINDS,
  PROCESS_STATES,
  STARTUP_LOCATIONS,
  type CpuStats,
  type DiskStats,
  type GpuStats,
  type KillResult,
  type KillTarget,
  type MemoryStats,
  type NetworkStats,
  PRIORITIES,
  type ProcessControls,
  type ProcessDetails,
  type ProcessIcon,
  type ProcessInfo,
  type ProcessRowValues,
  type ReplacementStatus,
  type Snapshot,
  type SnapshotWire,
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
  free: isCount,
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
  macAddress: isStr,
  addresses: arrayOf(isStr),
});

export const isGpuStats = shape<GpuStats>({
  name: isStr,
  vendor: isStr,
  usage: nullable(isPercent),
  memoryTotal: nullable(isCount),
  memoryUsed: nullable(isCount),
});

const PROCESS_ROW_SPEC: Record<keyof ProcessRowValues, Guard<unknown>> = {
  pid: isCount,
  parentPid: nullable(isCount),
  name: isStr,
  state: oneOf(PROCESS_STATES),
  cpu: isPercent,
  memory: isCount,
  diskReadPerSec: isCount,
  diskWrittenPerSec: isCount,
  runTimeSecs: isCount,
  startTime: isCount,
  virtualMemory: isCount,
  cpuTimeMs: isCount,
  diskReadTotal: isCount,
  diskWrittenTotal: isCount,
  handles: nullable(isCount),
  threads: nullable(isCount),
  sessionId: nullable(isCount),
  gpu: nullable(isPercent),
  gpuMemory: nullable(isCount),
  gpuEngine: nullable(isStr),
  efficient: isBool,
  appContainer: isBool,
};

export const isProcessInfo = shape<ProcessInfo>({
  ...PROCESS_ROW_SPEC,
  exe: isStr,
  command: isStr,
  user: isStr,
});

const isProcessRowValues = shape<ProcessRowValues>(PROCESS_ROW_SPEC);

/** 計測結果のプロセスの配列の並び（バックエンドの `ProcessRow` と同じ）。 */
export const PROCESS_ROW_FIELDS = [
  'pid',
  'parentPid',
  'name',
  'startTime',
  'state',
  'cpu',
  'memory',
  'diskReadPerSec',
  'diskWrittenPerSec',
  'runTimeSecs',
  'virtualMemory',
  'cpuTimeMs',
  'diskReadTotal',
  'diskWrittenTotal',
  'handles',
  'threads',
  'sessionId',
  'gpu',
  'gpuMemory',
  'gpuEngine',
  'efficient',
  'appContainer',
] as const satisfies readonly (keyof ProcessRowValues)[];

/** プロセスの配列を読む。並びや値が契約と違えば null。 */
export function decodeProcessRow(row: unknown): ProcessRowValues | null {
  if (!Array.isArray(row) || row.length !== PROCESS_ROW_FIELDS.length) return null;
  const values: Record<string, unknown> = {};
  PROCESS_ROW_FIELDS.forEach((field, i) => {
    values[field] = row[i];
  });
  return isProcessRowValues(values) ? values : null;
}

/** プロセスを項目名の無い配列にする（モックのバックエンドが送るときに使う）。 */
export function encodeProcessRow(p: ProcessRowValues): unknown[] {
  return PROCESS_ROW_FIELDS.map((field) => p[field]);
}

export const isProcessDetails = shape<ProcessDetails>({
  pid: isCount,
  startTime: isCount,
  exe: isStr,
  command: isStr,
  user: isStr,
});

export const isProcessDetailsList = arrayOf(isProcessDetails);

/** 計測結果（送られてくる形）。プロセスの配列の中身は decodeProcessRow で読む。 */
export const isSnapshotWire = shape<SnapshotWire>({
  timestampMs: isCount,
  cpu: isCpuStats,
  memory: isMemoryStats,
  disks: arrayOf(isDiskStats),
  networks: arrayOf(isNetworkStats),
  gpus: arrayOf(isGpuStats),
  processes: arrayOf((v: unknown): v is unknown[] => Array.isArray(v)),
});

export const isSnapshot = shape<Snapshot>({
  timestampMs: isCount,
  cpu: isCpuStats,
  memory: isMemoryStats,
  disks: arrayOf(isDiskStats),
  networks: arrayOf(isNetworkStats),
  gpus: arrayOf(isGpuStats),
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

/** 画像の data URL だけを受け付ける（img に入れるので、それ以外の URL は通さない）。 */
const isImageDataUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(v);

export const isProcessIcon = shape<ProcessIcon>({
  exe: isStr,
  icon: nullable(isImageDataUrl),
  description: nullable(isStr),
  company: nullable(isStr),
});
export const isProcessIcons = arrayOf(isProcessIcon);

export const isProcessControls = shape<ProcessControls>({
  priority: nullable(oneOf(PRIORITIES)),
  affinity: nullable(arrayOf(isCount)),
});

/** `null` を返すコマンド用。 */
export const isNull = (v: unknown): v is null => v === null;

export const isAppWindows = arrayOf(shape<AppWindow>({ pid: isCount, title: isStr }));

export const isServiceInfo = shape<ServiceInfo>({
  name: isStr,
  displayName: isStr,
  description: isStr,
  status: oneOf(SERVICE_STATUSES),
  pid: nullable(isCount),
  startType: oneOf(SERVICE_START_TYPES),
  group: isStr,
});
export const isServices = arrayOf(isServiceInfo);

const isPort = (v: unknown): v is number => isCount(v) && v <= 65535;

export const isConnection = shape<Connection>({
  protocol: oneOf(PROTOCOLS),
  localAddress: isStr,
  localPort: isPort,
  remoteAddress: isStr,
  remotePort: isPort,
  state: nullable(oneOf(TCP_STATES)),
  pid: nullable(isCount),
});
export const isConnections = arrayOf(isConnection);

export const isHandles = arrayOf(shape<HandleInfo>({ pid: isCount, path: isStr }));

export const isModules = arrayOf(shape<ModuleInfo>({ name: isStr, path: isStr, version: nullable(isStr) }));
