import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import { processTree } from './tree';

function proc(pid: number, parentPid: number | null): ProcessInfo {
  return {
    pid,
    parentPid,
    name: `p${String(pid)}`,
    exe: '',
    command: '',
    state: 'running',
    user: 'u',
    cpu: 0,
    memory: 0,
    diskReadPerSec: 0,
    diskWrittenPerSec: 0,
    runTimeSecs: 0,
    startTime: 1000 + pid,
    ...PROCESS_EXTRAS,
  };
}

const pids = (list: ProcessInfo[]) => list.map((p) => p.pid);

describe('processTree', () => {
  describe('equivalence', () => {
    it('子孫を子から先に並べ、根は最後', () => {
      const list = [proc(1, null), proc(2, 1), proc(3, 2), proc(4, 1), proc(5, null)];
      expect(pids(processTree(1, list))).toEqual([3, 2, 4, 1]);
    });

    it('関係ないプロセスは含めない', () => {
      const list = [proc(1, null), proc(2, 1), proc(9, 8)];
      expect(pids(processTree(2, list))).toEqual([2]);
    });
  });

  describe('boundary', () => {
    it('根が一覧に無ければ空', () => {
      expect(processTree(7, [proc(1, null)])).toEqual([]);
    });

    it('親子が輪になっていても止まり、同じものは 1 回だけ', () => {
      const list = [proc(1, 2), proc(2, 1)];
      expect(pids(processTree(1, list))).toEqual([2, 1]);
    });

    it('自分自身が親になっているものは子として数えない', () => {
      expect(pids(processTree(1, [proc(1, 1)]))).toEqual([1]);
    });
  });
});
