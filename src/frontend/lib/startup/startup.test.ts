import { describe, expect, it } from 'vitest';
import type { StartupEntry } from '../model/types';
import { filterStartup, startupValue } from './startup';

const entry: StartupEntry = {
  id: 'registryUser:Chat',
  name: 'Chat',
  command: '"C:\\Chat\\chat.exe" --tray',
  program: 'C:\\Chat\\chat.exe',
  location: 'registryUser',
  enabled: false,
  canToggle: true,
};

describe('startup', () => {
  describe('equivalence', () => {
    it('列ごとの値', () => {
      expect(startupValue(entry, 'name')).toBe('Chat');
      expect(startupValue(entry, 'program')).toBe('C:\\Chat\\chat.exe');
      expect(startupValue(entry, 'location')).toBe('レジストリ（ユーザー）');
      expect(startupValue(entry, 'enabled')).toBe('無効');
      expect(startupValue({ ...entry, enabled: true }, 'enabled')).toBe('有効');
    });

    it('名前とコマンドで絞り込む', () => {
      expect(filterStartup([entry], 'chat')).toHaveLength(1);
      expect(filterStartup([entry], '--TRAY')).toHaveLength(1);
      expect(filterStartup([entry], 'none')).toHaveLength(0);
    });
  });

  describe('boundary', () => {
    it('空の検索語は全件', () => {
      expect(filterStartup([entry], '')).toEqual([entry]);
    });
  });
});
