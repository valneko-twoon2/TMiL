// E2E・VRT 用の偽バックエンド。値は呼び出し回数だけで決まり、乱数は使わない。
import type {
  KillResult,
  ProcessInfo,
  ReplacementStatus,
  Snapshot,
  StartupEntry,
  SystemInfo,
} from '../model/types';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

interface ProcessSeed {
  name: string;
  count: number;
  cpu: number;
  memoryMb: number;
  user: string;
  state?: ProcessInfo['state'];
}

const SEEDS: ProcessSeed[] = [
  { name: 'System', count: 1, cpu: 0.4, memoryMb: 0.1, user: 'SYSTEM' },
  { name: 'explorer.exe', count: 1, cpu: 0.8, memoryMb: 180, user: 'user' },
  { name: 'chrome.exe', count: 6, cpu: 1.5, memoryMb: 220, user: 'user' },
  { name: 'Code.exe', count: 4, cpu: 2.2, memoryMb: 310, user: 'user' },
  { name: 'svchost.exe', count: 8, cpu: 0.2, memoryMb: 24, user: 'SYSTEM' },
  { name: 'TMiL.exe', count: 1, cpu: 0.3, memoryMb: 38, user: 'user' },
  { name: 'Discord.exe', count: 3, cpu: 0.6, memoryMb: 140, user: 'user' },
  { name: 'OneDrive.exe', count: 1, cpu: 0.1, memoryMb: 60, user: 'user' },
  { name: 'MsMpEng.exe', count: 1, cpu: 3.5, memoryMb: 250, user: 'SYSTEM' },
  { name: 'dwm.exe', count: 1, cpu: 1.1, memoryMb: 95, user: 'DWM-1' },
  { name: 'RuntimeBroker.exe', count: 2, cpu: 0, memoryMb: 18, user: 'user' },
  { name: 'backup-agent.exe', count: 1, cpu: 0, memoryMb: 12, user: 'user', state: 'stopped' },
];

/** 0〜1 を行き来する決まった波。 */
function wave(tick: number, phase: number, period: number): number {
  return (Math.sin((tick + phase) / period) + 1) / 2;
}

export interface MockState {
  tick: number;
  killed: Set<number>;
  startup: StartupEntry[];
  replaced: boolean;
}

export function createMockState(): MockState {
  return {
    tick: 0,
    killed: new Set(),
    replaced: false,
    startup: [
      startup(
        'registryUser',
        'Discord',
        String.raw`C:\Users\user\AppData\Local\Discord\Update.exe --processStart Discord.exe`,
        true,
      ),
      startup(
        'registryUser',
        'OneDrive',
        String.raw`"C:\Program Files\Microsoft OneDrive\OneDrive.exe" /background`,
        true,
      ),
      startup(
        'registryUser',
        'Spotify',
        String.raw`C:\Users\user\AppData\Roaming\Spotify\Spotify.exe /minimized`,
        false,
      ),
      startup(
        'registryMachine',
        'SecurityHealth',
        String.raw`%windir%\system32\SecurityHealthSystray.exe`,
        true,
      ),
      startup(
        'folderUser',
        'Notes.lnk',
        String.raw`C:\Users\user\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Notes.lnk`,
        true,
      ),
      startup('autostartSystem', 'nm-applet.desktop', 'nm-applet', true),
    ],
  };
}

function startup(
  location: StartupEntry['location'],
  name: string,
  command: string,
  enabled: boolean,
): StartupEntry {
  const program = command.startsWith('"')
    ? (command.slice(1).split('"')[0] ?? '')
    : (command.split(' ')[0] ?? '');
  return {
    id: `${location}:${name}`,
    name: name.replace(/\.(lnk|desktop)$/, ''),
    command,
    program,
    location,
    enabled,
    canToggle: location !== 'registryMachine',
  };
}

function processes(tick: number, killed: ReadonlySet<number>): ProcessInfo[] {
  const list: ProcessInfo[] = [];
  let pid = 1000;
  SEEDS.forEach((seed, s) => {
    for (let i = 0; i < seed.count; i += 1) {
      pid += 4;
      const id = seed.name === 'System' ? 4 : pid;
      if (killed.has(id)) continue;
      const busy = seed.cpu * (0.5 + wave(tick, s * 3 + i, 4));
      list.push({
        pid: id,
        parentPid: id === 4 ? null : 4,
        name: seed.name,
        exe:
          seed.name === 'System'
            ? ''
            : String.raw`C:\Program Files\${seed.name.replace('.exe', '')}\${seed.name}`,
        command: seed.name === 'System' ? '' : `${seed.name} --instance=${String(i)}`,
        state: seed.state ?? 'running',
        user: seed.user,
        cpu: seed.state === 'stopped' ? 0 : Math.round(busy * 10) / 10,
        memory: Math.round(seed.memoryMb * MB * (1 + i * 0.15)),
        diskReadPerSec: seed.name === 'MsMpEng.exe' ? Math.round(2 * MB * wave(tick, i, 3)) : 0,
        diskWrittenPerSec:
          seed.name === 'Code.exe' && i === 0 ? Math.round(300 * 1024 * wave(tick, 1, 2)) : 0,
        runTimeSecs: 3600 + tick,
      });
    }
  });
  return list;
}

export function mockSnapshot(state: MockState): Snapshot {
  const t = state.tick;
  const procs = processes(t, state.killed);
  const usage = Math.round((18 + 22 * wave(t, 0, 5) + 8 * wave(t, 2, 1.7)) * 10) / 10;
  return {
    timestampMs: 1_767_225_600_000 + t * 1000,
    cpu: {
      usage,
      perCore: Array.from(
        { length: 8 },
        (_, i) => Math.round(Math.min(100, usage * (0.5 + wave(t, i, 2))) * 10) / 10,
      ),
      frequencyMhz: 3200 + Math.round(400 * wave(t, 1, 6)),
      processCount: procs.length,
      uptimeSecs: 93_784 + t,
    },
    memory: {
      total: 16 * GB,
      used: Math.round((7.2 + 0.6 * wave(t, 0, 8)) * GB),
      available: Math.round((8.8 - 0.6 * wave(t, 0, 8)) * GB),
      swapTotal: 4 * GB,
      swapUsed: Math.round(0.5 * GB),
    },
    disks: [
      {
        name: 'Samsung SSD 980',
        mountPoint: 'C:\\',
        fileSystem: 'NTFS',
        kind: 'ssd',
        removable: false,
        total: 512 * GB,
        available: 192 * GB,
        readPerSec: Math.round(4 * MB * wave(t, 0, 3)),
        writtenPerSec: Math.round(1.5 * MB * wave(t, 2, 2)),
      },
      {
        name: 'WDC WD20EZRZ',
        mountPoint: 'D:\\',
        fileSystem: 'NTFS',
        kind: 'hdd',
        removable: false,
        total: 2000 * GB,
        available: 1200 * GB,
        readPerSec: 0,
        writtenPerSec: Math.round(200 * 1024 * wave(t, 1, 5)),
      },
    ],
    networks: [
      {
        name: 'イーサネット',
        receivedPerSec: Math.round(900 * 1024 * wave(t, 0, 2.5)),
        transmittedPerSec: Math.round(120 * 1024 * wave(t, 1, 3)),
        totalReceived: 12 * GB,
        totalTransmitted: 2 * GB,
      },
      {
        name: 'Loopback Pseudo-Interface 1',
        receivedPerSec: 0,
        transmittedPerSec: 0,
        totalReceived: 0,
        totalTransmitted: 0,
      },
    ],
    processes: procs,
  };
}

export const MOCK_SYSTEM_INFO: SystemInfo = {
  osName: 'Windows',
  osVersion: '11 (26100)',
  kernelVersion: '26100',
  hostName: 'MOCK-PC',
  cpuBrand: 'Mock CPU 8-Core Processor',
  physicalCores: 4,
  logicalCores: 8,
};

function kill(state: MockState, pids: number[]): KillResult[] {
  return pids.map((pid) => {
    if (pid === 4) return { pid, ok: false, error: '終了できませんでした。権限が足りない可能性があります。' };
    state.killed.add(pid);
    return { pid, ok: true, error: null };
  });
}

function replacement(state: MockState): ReplacementStatus {
  return { supported: true, replaced: state.replaced, other: null };
}

/** コマンド名と引数から応答を作る。知らないコマンドは例外にする。 */
export function handleCommand(state: MockState, cmd: string, args: Record<string, unknown> = {}): unknown {
  switch (cmd) {
    case 'snapshot': {
      const snap = mockSnapshot(state);
      state.tick += 1;
      return snap;
    }
    case 'system_info':
      return MOCK_SYSTEM_INFO;
    case 'kill_processes':
      return kill(
        state,
        Array.isArray(args.pids) ? args.pids.filter((p): p is number => typeof p === 'number') : [],
      );
    case 'startup_entries':
      return state.startup;
    case 'set_startup_enabled': {
      const target = state.startup.find((e) => e.id === args.id);
      if (!target) throw new Error('項目が見つかりません。一覧を更新してください。');
      if (!target.canToggle) throw new Error('この項目は切り替えられません（管理者権限が必要です）。');
      target.enabled = args.enabled === true;
      return null;
    }
    case 'taskmgr_replacement':
      return replacement(state);
    case 'set_taskmgr_replacement':
      state.replaced = args.enabled === true;
      return replacement(state);
    default:
      throw new Error(`未対応のコマンド: ${cmd}`);
  }
}
