// バックエンド（src/backend/core/src/model.rs）と同じ形の型。
// 形を変えたら tests/contract/fixtures の契約も更新すること。

export interface Snapshot {
  timestampMs: number;
  cpu: CpuStats;
  memory: MemoryStats;
  disks: DiskStats[];
  networks: NetworkStats[];
  gpus: GpuStats[];
  processes: ProcessInfo[];
}

export interface CpuStats {
  usage: number;
  perCore: number[];
  frequencyMhz: number;
  processCount: number;
  uptimeSecs: number;
}

export interface MemoryStats {
  total: number;
  used: number;
  available: number;
  /** どこにも使われていない量（Windows では available と同じ） */
  free: number;
  swapTotal: number;
  swapUsed: number;
}

export const DISK_KINDS = ['ssd', 'hdd', 'unknown'] as const;
export type DiskKind = (typeof DISK_KINDS)[number];

export interface DiskStats {
  name: string;
  mountPoint: string;
  fileSystem: string;
  kind: DiskKind;
  removable: boolean;
  total: number;
  available: number;
  readPerSec: number;
  writtenPerSec: number;
}

export interface NetworkStats {
  name: string;
  receivedPerSec: number;
  transmittedPerSec: number;
  totalReceived: number;
  totalTransmitted: number;
  /** MAC アドレス（取れなければ空） */
  macAddress: string;
  /** IP アドレスと接頭辞の長さ（例: 192.168.1.2/24） */
  addresses: string[];
}

/** GPU 1 つ分の状態。取れない値は null。 */
export interface GpuStats {
  name: string;
  vendor: string;
  usage: number | null;
  memoryTotal: number | null;
  memoryUsed: number | null;
}

export const PROCESS_STATES = ['running', 'sleeping', 'stopped', 'zombie', 'other'] as const;
export type ProcessState = (typeof PROCESS_STATES)[number];

export interface ProcessInfo {
  pid: number;
  parentPid: number | null;
  name: string;
  exe: string;
  command: string;
  state: ProcessState;
  user: string;
  cpu: number;
  memory: number;
  diskReadPerSec: number;
  diskWrittenPerSec: number;
  runTimeSecs: number;
  /** 起動した時刻（UNIX 秒）。終了するときに同じプロセスかを確かめる */
  startTime: number;
  /** 仮想メモリ（Windows ではコミット サイズ） */
  virtualMemory: number;
  /** 起動してから使った CPU 時間の合計（ミリ秒） */
  cpuTimeMs: number;
  /** 起動してから読み書きしたバイト数の合計 */
  diskReadTotal: number;
  diskWrittenTotal: number;
  /** ハンドルの数（Linux では開いているファイルの数） */
  handles: number | null;
  /** スレッドの数（Linux のみ） */
  threads: number | null;
  sessionId: number | null;
  /** GPU 使用率（0〜100）と GPU メモリ（バイト） */
  gpu: number | null;
  gpuMemory: number | null;
  /** いちばん使っている GPU エンジン（`GPU 0 - 3D` など。Windows のみ） */
  gpuEngine: string | null;
  /** 効率モード（EcoQoS）に入っている（ほかのアプリが入れたものも含む。Windows のみ） */
  efficient: boolean;
  /** AppContainer の中で動いている（本家の「分離」の列。Windows のみ） */
  appContainer: boolean;
}

/** 終了するプロセスの指定。 */
export interface KillTarget {
  pid: number;
  startTime: number;
}

export interface SystemInfo {
  osName: string;
  osVersion: string;
  kernelVersion: string;
  hostName: string;
  cpuBrand: string;
  physicalCores: number | null;
  logicalCores: number;
}

export interface KillResult {
  pid: number;
  ok: boolean;
  error: string | null;
}

export const STARTUP_LOCATIONS = [
  'registryUser',
  'registryMachine',
  'folderUser',
  'folderCommon',
  'autostartUser',
  'autostartSystem',
] as const;
export type StartupLocation = (typeof STARTUP_LOCATIONS)[number];

export interface StartupEntry {
  id: string;
  name: string;
  command: string;
  program: string;
  location: StartupLocation;
  enabled: boolean;
  canToggle: boolean;
}

/** プロセスの優先度（Windows の優先度クラスに合わせた 6 段階。高い順）。 */
export const PRIORITIES = ['realtime', 'high', 'aboveNormal', 'normal', 'belowNormal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** プロセスの今の優先度と、動かしてよい CPU の番号（読めなければ null）。 */
export interface ProcessControls {
  priority: Priority | null;
  affinity: number[] | null;
}

/** 実行ファイルのアイコンと説明。icon は画像の data URL（見つからなければ null）。 */
export interface ProcessIcon {
  exe: string;
  icon: string | null;
  /** 説明（Windows はファイルの説明、Linux は .desktop の名前） */
  description: string | null;
  /** 発行元（Windows の会社名） */
  company: string | null;
}

export interface ReplacementStatus {
  supported: boolean;
  replaced: boolean;
  other: string | null;
}

/** 画面にウィンドウを出しているプロセス（本家の「アプリ」）。 */
export interface AppWindow {
  pid: number;
  title: string;
}

export const SERVICE_STATUSES = [
  'running',
  'stopped',
  'paused',
  'startPending',
  'stopPending',
  'other',
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_START_TYPES = ['automatic', 'manual', 'disabled', 'other'] as const;
export type ServiceStartType = (typeof SERVICE_START_TYPES)[number];

export const SERVICE_ACTIONS = ['start', 'stop', 'restart'] as const;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];

/** サービス 1 つ分。 */
export interface ServiceInfo {
  /** サービス名（操作に使う） */
  name: string;
  /** 表示名（本家の「説明」の列） */
  displayName: string;
  description: string;
  status: ServiceStatus;
  pid: number | null;
  startType: ServiceStartType;
  /** svchost のグループ（Windows のみ） */
  group: string;
}

export const PROTOCOLS = ['tcp', 'udp'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const TCP_STATES = [
  'listen',
  'established',
  'synSent',
  'synReceived',
  'finWait1',
  'finWait2',
  'timeWait',
  'closeWait',
  'lastAck',
  'closing',
  'closed',
] as const;
export type TcpState = (typeof TCP_STATES)[number];

/** ネットワークの接続か待ち受け 1 つ分。 */
export interface Connection {
  protocol: Protocol;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  /** TCP の状態（UDP は null） */
  state: TcpState | null;
  pid: number | null;
}

/** ファイルなどを開いているプロセス（リソース モニターの「関連付けられたハンドル」）。 */
export interface HandleInfo {
  pid: number;
  path: string;
}

/** プロセスが読み込んでいるモジュール。 */
export interface ModuleInfo {
  name: string;
  path: string;
  version: string | null;
}
