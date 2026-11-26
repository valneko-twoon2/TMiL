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
