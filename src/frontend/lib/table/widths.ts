export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 1200;
const MAX_ENTRIES = 100;
const KEY_PATTERN = /^[a-z]+\.[A-Za-z0-9]+$/;

export type ColumnWidths = Record<string, number>;
export type TableName = Lowercase<string>;

export const DEFAULT_WIDTHS: Record<string, Record<string, number> | undefined> = {
  processes: {
    name: 300,
    type: 130,
    status: 90,
    publisher: 160,
    pid: 70,
    processName: 140,
    command: 300,
    cpu: 90,
    memory: 110,
    disk: 110,
    gpu: 80,
    gpuEngine: 120,
    power: 110,
    powerTrend: 150,
    isolation: 110,
  },
  details: {
    name: 220,
    pid: 70,
    state: 80,
    user: 110,
    cpu: 70,
    memory: 100,
    disk: 90,
    diskRead: 120,
    diskWrite: 120,
    parentPid: 70,
    runTime: 100,
    startTime: 160,
    cpuTime: 90,
    commit: 110,
    handles: 80,
    threads: 80,
    sessionId: 90,
    ioRead: 130,
    ioWrite: 130,
    gpu: 70,
    gpuMemory: 100,
    exe: 280,
    command: 360,
    description: 240,
  },
  startup: { name: 240, publisher: 180, program: 340, location: 200, enabled: 80 },
};

const FALLBACK_WIDTH = 120;

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_COLUMN_WIDTH;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

export function widthOf(
  widths: ColumnWidths,
  table: TableName,
  column: string,
  fallback: number = FALLBACK_WIDTH,
): number {
  return widths[`${table}.${column}`] ?? DEFAULT_WIDTHS[table]?.[column] ?? fallback;
}

/** 列の幅を変えた新しい値。`null` なら最初の幅に戻す。 */
export function withWidth(
  widths: ColumnWidths,
  table: TableName,
  column: string,
  width: number | null,
): ColumnWidths {
  const key = `${table}.${column}`;
  const rest = Object.fromEntries(Object.entries(widths).filter(([k]) => k !== key));
  return width === null ? rest : { ...rest, [key]: clampWidth(width) };
}

export function parseWidths(value: unknown): ColumnWidths {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((e): e is [string, number] => KEY_PATTERN.test(e[0]) && typeof e[1] === 'number')
    .slice(0, MAX_ENTRIES)
    .map(([key, width]) => [key, clampWidth(width)] as const);
  return Object.fromEntries(entries);
}
