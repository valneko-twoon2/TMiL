import type {
  AppWindow,
  Connection,
  HandleInfo,
  ModuleInfo,
  ProcessInfo,
  ServiceAction,
  ServiceInfo,
} from '../model/types';

const NOT_FOUND_MARK = 'nosuch';

export interface SystemMockState {
  services: ServiceInfo[];
  launched: { command: string; admin: boolean }[];
  switched: number[];
  servicesToolOpened: number;
  alwaysOnTop: boolean;
}

function service(
  name: string,
  displayName: string,
  status: ServiceInfo['status'],
  pid: number | null,
  startType: ServiceInfo['startType'],
  group = '',
): ServiceInfo {
  return { name, displayName, description: `${displayName} の説明です。`, status, pid, startType, group };
}

export function createSystemMock(): SystemMockState {
  return {
    services: [
      service('Audiosrv', 'Windows Audio', 'running', 1068, 'automatic', 'LocalServiceNetworkRestricted'),
      service('BITS', 'Background Intelligent Transfer Service', 'running', 1052, 'manual', 'netsvcs'),
      service('Dnscache', 'DNS Client', 'running', 1056, 'automatic', 'NetworkService'),
      service('EventLog', 'Windows Event Log', 'running', 1060, 'automatic', 'LocalServiceNetworkRestricted'),
      service('Fax', 'Fax', 'stopped', null, 'disabled'),
      service('Spooler', 'Print Spooler', 'stopped', null, 'automatic'),
      service('TermService', 'Remote Desktop Services', 'stopped', null, 'manual', 'NetworkService'),
      service('Themes', 'Themes', 'running', 1064, 'automatic', 'netsvcs'),
      service('WinDefend', 'Microsoft Defender Antivirus Service', 'running', 1104, 'automatic'),
      service('WSearch', 'Windows Search', 'stopped', null, 'manual'),
      service('wuauserv', 'Windows Update', 'running', 1052, 'manual', 'netsvcs'),
    ],
    launched: [],
    switched: [],
    servicesToolOpened: 0,
    alwaysOnTop: false,
  };
}

export function controlService(state: SystemMockState, name: unknown, action: ServiceAction): null {
  const target = state.services.find((s) => s.name === name);
  if (!target) throw new Error(`サービスの名前が正しくありません: ${String(name)}`);
  if (action !== 'stop' && target.startType === 'disabled') {
    throw new Error('サービスを操作できませんでした。このサービスは無効になっています。');
  }
  const running = action !== 'stop';
  const pid = running ? (target.pid ?? 2000 + target.name.length * 4) : null;
  state.services = state.services.map((s) =>
    s.name === name ? { ...s, status: running ? 'running' : 'stopped', pid } : s,
  );
  return null;
}

export function appWindows(killed: ReadonlySet<number>): AppWindow[] {
  const windows: AppWindow[] = [
    { pid: 1008, title: 'エクスプローラー' },
    { pid: 1012, title: '新しいタブ - Google Chrome' },
    { pid: 1036, title: 'app.ts - TaskManagerLite - Visual Studio Code' },
    { pid: 1084, title: 'TaskManagerLite' },
    { pid: 1088, title: 'Discord' },
  ];
  return windows.filter((w) => !killed.has(w.pid));
}

function tcp(
  pid: number | null,
  local: [string, number],
  remote: [string, number],
  state: Connection['state'],
): Connection {
  return {
    protocol: 'tcp',
    localAddress: local[0],
    localPort: local[1],
    remoteAddress: remote[0],
    remotePort: remote[1],
    state,
    pid,
  };
}

export function connections(killed: ReadonlySet<number>): Connection[] {
  const list: Connection[] = [
    tcp(1056, ['0.0.0.0', 135], ['0.0.0.0', 0], 'listen'),
    tcp(4, ['0.0.0.0', 445], ['0.0.0.0', 0], 'listen'),
    tcp(1084, ['127.0.0.1', 1420], ['0.0.0.0', 0], 'listen'),
    tcp(1012, ['192.168.1.20', 50412], ['142.250.196.110', 443], 'established'),
    tcp(1016, ['192.168.1.20', 50418], ['142.250.196.110', 443], 'established'),
    tcp(1036, ['192.168.1.20', 50433], ['140.82.112.25', 443], 'established'),
    tcp(1088, ['192.168.1.20', 50450], ['162.159.135.232', 443], 'established'),
    tcp(1100, ['192.168.1.20', 50461], ['13.107.42.12', 443], 'timeWait'),
    tcp(null, ['192.168.1.20', 50470], ['20.190.151.7', 443], 'closeWait'),
    {
      protocol: 'udp',
      localAddress: '0.0.0.0',
      localPort: 5353,
      remoteAddress: '*',
      remotePort: 0,
      state: null,
      pid: 1012,
    },
    {
      protocol: 'udp',
      localAddress: '::',
      localPort: 5355,
      remoteAddress: '*',
      remotePort: 0,
      state: null,
      pid: 1056,
    },
  ];
  return list.filter((c) => c.pid === null || !killed.has(c.pid));
}

const COMMON_MODULES = [
  'ntdll.dll',
  'KERNEL32.DLL',
  'KERNELBASE.dll',
  'USER32.dll',
  'win32u.dll',
  'GDI32.dll',
];

export function modules(pid: number, exe: string | undefined): ModuleInfo[] {
  if (pid === 4 || exe === undefined) {
    throw new Error(
      'モジュールを読めませんでした。権限が足りないか、プロセスが終了している可能性があります。',
    );
  }
  const own: ModuleInfo = { name: exe.split('\\').pop() ?? exe, path: exe, version: '1.0.0.0' };
  return [
    own,
    ...COMMON_MODULES.map((name) => ({
      name,
      path: ['C:', 'Windows', 'SYSTEM32', name].join('\\'),
      version: '10.0.26100.1',
    })),
  ];
}

export function handles(query: unknown, list: readonly Pick<ProcessInfo, 'pid'>[]): HandleInfo[] {
  const text = typeof query === 'string' ? query.trim() : '';
  if (text === '') return [];
  if (text.includes(NOT_FOUND_MARK)) {
    throw new Error(`'${text}' が見つかりません。ファイルかフォルダーの場所を入れてください。`);
  }
  return list.slice(0, 2).map((p) => ({ pid: p.pid, path: text }));
}

export function runTask(state: SystemMockState, command: unknown, admin: unknown): null {
  const text = typeof command === 'string' ? command.trim() : '';
  if (text === '') {
    throw new Error(
      '開くプログラム、フォルダー、ドキュメント、またはインターネット リソースの名前を入力してください。',
    );
  }
  const program = text.split(' ')[0] ?? text;
  if (program.startsWith(NOT_FOUND_MARK)) {
    throw new Error(
      `'${program}' が見つかりません。名前を正しく入力したかどうかを確認してから、やり直してください。`,
    );
  }
  state.launched.push({ command: text, admin: admin === true });
  return null;
}
