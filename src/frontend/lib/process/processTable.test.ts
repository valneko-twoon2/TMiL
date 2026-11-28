import { describe, expect, it } from 'vitest';
import { PROCESS_EXTRAS, snapshotFixture } from '../../test/fixtures';
import type { ProcessInfo } from '../model/types';
import { cellText } from '../table/table';
import { processTableColumns, type ProcessTableKey } from './processTable';

const ALL: ProcessTableKey[] = [
  'image',
  'pid',
  'description',
  'state',
  'user',
  'threads',
  'handles',
  'cpu',
  'averageCpu',
  'cpuTime',
  'memory',
  'commit',
  'diskRead',
  'diskWrite',
  'diskTotal',
  'readTotal',
  'writeTotal',
  'gpu',
  'connections',
  'exe',
];

function proc(extra: Partial<ProcessInfo> = {}): ProcessInfo {
  const base = snapshotFixture().processes[0];
  if (!base) throw new Error('fixture');
  return { ...base, ...PROCESS_EXTRAS, ...extra };
}

describe('プロセスの共通の列', () => {
  describe('equivalence', () => {
    it('すべての列に見出しと幅があり、文字を出せる', () => {
      const p = proc({ threads: 8, handles: 1200, gpu: 2.5, cpuTimeMs: 61_000 });
      const cols = processTableColumns(ALL, {
        icon: () => null,
        description: () => '説明',
        memoryTotal: 1000,
        averageCpu: () => 1.234,
        connections: () => 3,
      });
      for (const c of cols) {
        expect(c.label).not.toBe('');
        expect(c.width).toBeGreaterThan(0);
        expect(typeof cellText(c, p)).toBe('string');
      }
      const text = (key: string) => cellText(cols.find((c) => c.key === key) ?? (cols[0] as never), p);
      expect(text('threads')).toBe('8');
      expect(text('handles')).toBe('1,200');
      expect(text('gpu')).toBe('2.5%');
      expect(text('averageCpu')).toBe('1.23%');
      expect(text('cpuTime')).toBe('0:01:01');
      expect(text('connections')).toBe('3');
      expect(text('description')).toBe('説明');
      expect(cols.find((c) => c.key === 'image')?.icon?.(p)).toBeNull();
    });

    it('見出しを場所ごとに変えられる', () => {
      const [memory] = processTableColumns([{ key: 'memory', label: 'メモリ' }]);
      expect(memory?.label).toBe('メモリ');
      expect(memory?.numeric).toBe(true);
    });
  });

  describe('boundary', () => {
    it('取れない値は空の文字にし、並べ替えでは先頭', () => {
      const p = proc({ threads: null, handles: null, gpu: null });
      const cols = processTableColumns([
        'threads',
        'handles',
        'gpu',
        'averageCpu',
        'connections',
        'description',
      ]);
      expect(cols.map((c) => cellText(c, p))).toEqual(['', '', '', '', '0', 'init']);
      expect(cols.slice(0, 4).map((c) => c.value(p))).toEqual([-1, -1, -1, -1]);
    });

    it('アイコンの引き方を渡さなければ、名前の列にアイコンの場所を空けない', () => {
      const [image] = processTableColumns(['image']);
      expect(image?.icon).toBeUndefined();
    });
  });
});
