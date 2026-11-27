import {
  isKillTargets,
  isProcessControls,
  isProcessIcons,
  isSnapshot,
  isStartupEntries,
  isSystemInfo,
  isKillResults,
} from './guards';
import { readFixture } from '../../test/fixtures';
import { describe, expect, it } from 'vitest';
import { isKillResult, isNull, isProcessInfo, isReplacementStatus, isStartupEntry } from './guards';
import type { ProcessInfo } from './types';

const process: ProcessInfo = {
  pid: 10,
  parentPid: null,
  name: 'a',
  exe: '',
  command: '',
  state: 'running',
  user: '',
  cpu: 0,
  memory: 0,
  diskReadPerSec: 0,
  diskWrittenPerSec: 0,
  runTimeSecs: 0,
  startTime: 0,
};

describe('guards', () => {
  describe('equivalence', () => {
    it('正しいプロセス情報を受け取る', () => {
      expect(isProcessInfo(process)).toBe(true);
    });

    it('余分なキーがあっても受け取る（後方互換）', () => {
      expect(isProcessInfo({ ...process, extra: 1 })).toBe(true);
    });

    it('型の違う値は受け取らない', () => {
      expect(isProcessInfo({ ...process, pid: '10' })).toBe(false);
      expect(isProcessInfo({ ...process, state: 'unknown' })).toBe(false);
    });

    it('オブジェクト以外は受け取らない', () => {
      for (const v of [null, undefined, 1, 'x', [], [process]]) expect(isProcessInfo(v)).toBe(false);
    });

    it('nullable な値は null も受け取る', () => {
      expect(isKillResult({ pid: 1, ok: false, error: null })).toBe(true);
      expect(isKillResult({ pid: 1, ok: false, error: 'x' })).toBe(true);
      expect(isReplacementStatus({ supported: false, replaced: false, other: null })).toBe(true);
    });

    it('isNull は null だけを受け取る', () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
    });
  });

  describe('boundary', () => {
    it('CPU 使用率は 0 と 100 を含み、範囲外は弾く', () => {
      expect(isProcessInfo({ ...process, cpu: 0 })).toBe(true);
      expect(isProcessInfo({ ...process, cpu: 100 })).toBe(true);
      expect(isProcessInfo({ ...process, cpu: -0.1 })).toBe(false);
      expect(isProcessInfo({ ...process, cpu: 100.1 })).toBe(false);
    });

    it('件数は 0 以上の整数だけ', () => {
      expect(isProcessInfo({ ...process, pid: 0 })).toBe(true);
      expect(isProcessInfo({ ...process, pid: -1 })).toBe(false);
      expect(isProcessInfo({ ...process, pid: 1.5 })).toBe(false);
    });

    it('NaN と Infinity は数値として扱わない', () => {
      expect(isProcessInfo({ ...process, memory: Number.NaN })).toBe(false);
      expect(isProcessInfo({ ...process, memory: Number.POSITIVE_INFINITY })).toBe(false);
    });

    it('空文字の ID も形としては受け取る', () => {
      const entry = {
        id: '',
        name: '',
        command: '',
        program: '',
        location: 'registryUser',
        enabled: true,
        canToggle: false,
      };
      expect(isStartupEntry(entry)).toBe(true);
    });
  });
});

/** 値の中の、すべての項目へのたどり方（配列は最初の要素だけ）。 */
function* paths(value: unknown, path: (string | number)[] = []): Generator<(string | number)[]> {
  if (Array.isArray(value)) {
    if (value.length > 0) yield* paths(value[0], [...path, 0]);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      yield [...path, key];
      yield* paths(child, [...path, key]);
    }
  }
}

/** 型の違う値（数なら文字や無限大、文字なら数 など）。 */
function wrongValues(value: unknown): unknown[] {
  if (typeof value === 'number') return ['1', Number.POSITIVE_INFINITY, Number.NaN];
  if (typeof value === 'string') return [1];
  if (typeof value === 'boolean') return ['true'];
  if (value === null) return [{}];
  if (Array.isArray(value)) return ['x', {}];
  return ['x', null];
}

function replaced(root: unknown, path: (string | number)[], next: unknown, remove: boolean): unknown {
  const copy = structuredClone(root) as Record<string | number, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  const last = path.at(-1) ?? '';
  if (remove) Reflect.deleteProperty(node, last);
  else node[last] = next;
  return copy;
}

const CONTRACTS: [string, (v: unknown) => boolean][] = [
  ['snapshot', isSnapshot],
  ['system-info', isSystemInfo],
  ['kill-results', isKillResults],
  ['kill-targets', isKillTargets],
  ['startup-entries', isStartupEntries],
  ['process-icons', isProcessIcons],
  ['process-controls', (v) => Array.isArray(v) && v.every(isProcessControls)],
];

describe('検証関数（型の違い）', () => {
  describe('contract', () => {
    it.each(CONTRACTS)('%s: どの項目でも、型が違う・項目が無いなら受け取らない', (name, guard) => {
      const value = readFixture(name);
      expect(guard(value)).toBe(true);
      for (const path of paths(value)) {
        const original = path.reduce<unknown>((v, k) => (v as Record<string | number, unknown>)[k], value);
        for (const wrong of wrongValues(original)) {
          expect(guard(replaced(value, path, wrong, false)), `${path.join('.')} = ${String(wrong)}`).toBe(
            false,
          );
        }
        if (typeof path.at(-1) === 'string') {
          expect(guard(replaced(value, path, undefined, true)), `${path.join('.')} が無い`).toBe(false);
        }
      }
    });
  });

  describe('boundary', () => {
    const icon = (url: unknown) => isProcessIcons([{ exe: 'a', icon: url }]);

    it('画像は PNG・SVG の data URL だけ。前後に余計なものがあれば受け取らない', () => {
      expect(icon('data:image/png;base64,AAAA')).toBe(true);
      expect(icon('data:image/png;base64,AA==')).toBe(true);
      expect(icon('data:image/svg+xml;base64,AAA=')).toBe(true);
      expect(icon('xdata:image/png;base64,AA==')).toBe(false);
      expect(icon('data:image/png;base64,AA==<script>')).toBe(false);
      expect(icon('data:image/gif;base64,AA==')).toBe(false);
      expect(icon('https://example.com/a.png')).toBe(false);
      expect(icon(null)).toBe(true);
    });
  });
});
