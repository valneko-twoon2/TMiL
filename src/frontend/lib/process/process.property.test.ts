// プロセスの一覧まわりの純粋関数に、どんな入力でも成り立つ性質があるかを fast-check で確かめる。
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ProcessInfo } from '../model/types';
import {
  DETAIL_COLUMNS,
  normalizeDetailColumns,
  REQUIRED_DETAIL_COLUMN,
  toggleDetailColumn,
} from './columns';
import { unknownExes } from './icons';
import { filterProcesses, groupProcesses, nextSort, sortBy } from './process';
import { processTree } from './tree';

const processArb: fc.Arbitrary<ProcessInfo> = fc.record({
  pid: fc.nat({ max: 50 }),
  parentPid: fc.option(fc.nat({ max: 50 }), { nil: null }),
  name: fc.constantFrom('a.exe', 'B.exe', 'b.exe', 'svchost.exe', 'カ.exe'),
  exe: fc.string(),
  command: fc.string(),
  state: fc.constantFrom('running', 'sleeping', 'stopped', 'zombie', 'other'),
  user: fc.constantFrom('alice', 'SYSTEM', ''),
  cpu: fc.double({ min: 0, max: 30, noNaN: true }),
  memory: fc.nat(),
  diskReadPerSec: fc.nat({ max: 1000 }),
  diskWrittenPerSec: fc.nat({ max: 1000 }),
  runTimeSecs: fc.nat(),
  startTime: fc.nat(),
});

/** PID が重ならない一覧（実際の一覧と同じ）。 */
const listArb = fc.uniqueArray(processArb, { selector: (p) => p.pid, maxLength: 30 });
const columnArb = fc.constantFrom(...DETAIL_COLUMNS.map((c) => c.key));
const byPid = (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid;

describe('プロセスの一覧', () => {
  describe('property', () => {
    it('並べ替えは要素を増やしも減らしもせず、指定の向きに並ぶ', () => {
      fc.assert(
        fc.property(listArb, fc.constantFrom<'asc' | 'desc'>('asc', 'desc'), (list, direction) => {
          const sorted = sortBy(list, { key: 'cpu', direction }, (p) => p.cpu);
          expect([...sorted].sort(byPid)).toEqual([...list].sort(byPid));
          for (let i = 1; i < sorted.length; i += 1) {
            const [prev, cur] = [sorted[i - 1]?.cpu ?? 0, sorted[i]?.cpu ?? 0];
            expect(direction === 'asc' ? prev <= cur : prev >= cur).toBe(true);
          }
        }),
      );
    });

    it('同じ列を 2 回押すと元の向きに戻る', () => {
      fc.assert(
        fc.property(columnArb, fc.constantFrom<'asc' | 'desc'>('asc', 'desc'), (key, direction) => {
          const start = { key, direction };
          expect(nextSort(nextSort(start, key, []), key, [])).toEqual(start);
        }),
      );
    });

    it('絞り込みは元の一覧の一部で、もう一度かけても変わらない', () => {
      fc.assert(
        fc.property(listArb, fc.string({ maxLength: 4 }), (list, query) => {
          const once = filterProcesses(list, query);
          expect(once.every((p) => list.includes(p))).toBe(true);
          expect(filterProcesses(once, query)).toEqual(once);
        }),
      );
    });

    it('まとめても数は変わらず、名前が同じものは同じ行に入る', () => {
      fc.assert(
        fc.property(listArb, (list) => {
          const groups = groupProcesses(list);
          expect(groups.reduce((n, g) => n + g.children.length, 0)).toBe(list.length);
          for (const g of groups) {
            expect(g.children.every((c) => c.name.toLowerCase() === g.key)).toBe(true);
            const disk = g.children.reduce((n, c) => n + c.diskReadPerSec + c.diskWrittenPerSec, 0);
            expect(g.diskPerSec).toBe(disk);
            expect(g.cpu).toBeLessThanOrEqual(100);
          }
          expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
        }),
      );
    });

    it('プロセス ツリーは根で終わり、子は必ず親より先に並ぶ', () => {
      fc.assert(
        fc.property(listArb, fc.nat({ max: 50 }), (list, rootPid) => {
          const tree = processTree(rootPid, list);
          if (!list.some((p) => p.pid === rootPid)) {
            expect(tree).toEqual([]);
            return;
          }
          expect(tree.at(-1)?.pid).toBe(rootPid);
          expect(new Set(tree.map((p) => p.pid)).size).toBe(tree.length);
          const position = new Map(tree.map((p, i) => [p.pid, i]));
          for (const p of tree) {
            if (p.pid === rootPid || p.parentPid === null) continue;
            // 根以外は、親がツリーの中にいて、親より前に並ぶ
            const parent = position.get(p.parentPid);
            expect(parent).toBeDefined();
            expect(position.get(p.pid) ?? -1).toBeLessThan(parent ?? -1);
          }
        }),
      );
    });

    it('詳細タブの列は、どう整えても名前を含み、決まった順で重ならない。整え直しても変わらない', () => {
      fc.assert(
        fc.property(fc.array(fc.oneof(columnArb, fc.string()) as fc.Arbitrary<unknown>), (value) => {
          const columns = normalizeDetailColumns(value);
          expect(columns).toContain(REQUIRED_DETAIL_COLUMN);
          expect(new Set(columns).size).toBe(columns.length);
          const order = DETAIL_COLUMNS.map((c) => c.key);
          expect([...columns].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(columns);
          expect(normalizeDetailColumns(columns)).toEqual(columns);
        }),
      );
    });

    it('名前以外の列は 2 回切り替えると元に戻る', () => {
      fc.assert(
        fc.property(fc.array(columnArb), columnArb, (value, column) => {
          const columns = normalizeDetailColumns(value);
          const twice = toggleDetailColumn(toggleDetailColumn(columns, column), column);
          expect(twice).toEqual(columns);
        }),
      );
    });

    it('アイコンを問い合わせる対象は、知らないものだけを重ならずに上限まで', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('', ' ', 'a', 'b', 'c', 'd')),
          fc.subarray(['a', 'b']),
          fc.subarray(['c']),
          fc.nat({ max: 5 }),
          (exes, known, pending, limit) => {
            const asked = unknownExes(exes, new Map(known.map((k) => [k, null])), new Set(pending), limit);
            expect(asked.length).toBeLessThanOrEqual(limit);
            expect(new Set(asked).size).toBe(asked.length);
            for (const e of asked) {
              expect(exes).toContain(e);
              expect(e.trim()).not.toBe('');
              expect([...known, ...pending]).not.toContain(e);
            }
          },
        ),
      );
    });
  });
});
