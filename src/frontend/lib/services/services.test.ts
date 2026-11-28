import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures';
import { SERVICE_STATUSES, type ServiceInfo } from '../model/types';
import { cellText } from '../table/table';
import {
  filterServices,
  SERVICE_COLUMNS,
  serviceCommands,
  servicesOf,
  serviceStatusLabel,
  startTypeLabel,
} from './services';

const service = (extra: Partial<ServiceInfo> = {}): ServiceInfo => ({
  name: 'wuauserv',
  displayName: 'Windows Update',
  description: '',
  status: 'running',
  pid: 1052,
  startType: 'manual',
  group: 'netsvcs',
  ...extra,
});

describe('サービス', () => {
  describe('equivalence', () => {
    it('状態と開始の種類を本家の言い方にする', () => {
      expect(serviceStatusLabel('running')).toBe('実行中');
      expect(serviceStatusLabel('stopped')).toBe('停止');
      expect(serviceStatusLabel('paused')).toBe('一時停止');
      expect(serviceStatusLabel('startPending')).toBe('開始待ち');
      expect(serviceStatusLabel('stopPending')).toBe('停止待ち');
      expect(startTypeLabel('automatic')).toBe('自動');
      expect(startTypeLabel('manual')).toBe('手動');
      expect(startTypeLabel('disabled')).toBe('無効');
    });

    it('名前・説明・グループ・PID で絞り込む', () => {
      const list = [
        service(),
        service({ name: 'Spooler', displayName: 'Print Spooler', pid: null, group: '' }),
      ];
      expect(filterServices(list, 'print').map((s) => s.name)).toEqual(['Spooler']);
      expect(filterServices(list, 'NETSVCS').map((s) => s.name)).toEqual(['wuauserv']);
      expect(filterServices(list, '1052').map((s) => s.name)).toEqual(['wuauserv']);
      expect(filterServices(list, '')).toHaveLength(2);
    });

    it('動いているものは止める・再起動、止まっているものは開始できる', () => {
      expect(serviceCommands(service())).toEqual({ start: false, stop: true, restart: true });
      expect(serviceCommands(service({ status: 'paused' }))).toEqual({
        start: false,
        stop: true,
        restart: true,
      });
      expect(serviceCommands(service({ status: 'stopped', pid: null }))).toEqual({
        start: true,
        stop: false,
        restart: false,
      });
    });

    it('PID からサービスを引く', () => {
      const list = readFixture('services') as ServiceInfo[];
      expect(servicesOf(list, new Set([100])).every((s) => s.pid === 100)).toBe(true);
      expect(servicesOf(list, new Set())).toEqual([]);
    });

    it('表の列は本家の並び（名前・PID・説明・状態・グループ）', () => {
      expect(SERVICE_COLUMNS.map((c) => c.label)).toEqual([
        '名前',
        'PID',
        '説明',
        '状態',
        'グループ',
        'スタートアップの種類',
      ]);
      expect(SERVICE_COLUMNS.map((c) => cellText(c, service()))).toEqual([
        'wuauserv',
        '1052',
        'Windows Update',
        '実行中',
        'netsvcs',
        '手動',
      ]);
    });
  });

  describe('boundary', () => {
    it('無効なものや、待ち・不明の状態では何もできない', () => {
      expect(serviceCommands(service({ status: 'stopped', startType: 'disabled' })).start).toBe(false);
      for (const status of SERVICE_STATUSES.filter((s) => s.endsWith('Pending') || s === 'other')) {
        expect(serviceCommands(service({ status }))).toEqual({ start: false, stop: false, restart: false });
      }
      expect(serviceCommands(undefined)).toEqual({ start: false, stop: false, restart: false });
    });

    it('PID の無いサービスは PID の列が空で、並べ替えでは先頭', () => {
      const stopped = service({ pid: null });
      const pid = SERVICE_COLUMNS.find((c) => c.key === 'pid');
      expect(pid && cellText(pid, stopped)).toBe('');
      expect(pid?.value(stopped)).toBe(-1);
      expect(startTypeLabel('other')).toBe('');
      expect(serviceStatusLabel('other')).toBe('');
    });
  });
});
