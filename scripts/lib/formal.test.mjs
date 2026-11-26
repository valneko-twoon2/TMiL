import { describe, expect, it } from 'vitest';
import { formalChecks, propertiesInCfg, tlcArgs } from './formal.mjs';

const CFG = String.raw`\* comment
CONSTANTS
    Pids = {1, 2}
SPECIFICATION Spec
INVARIANTS
    TypeOK
    Safe \* trailing comment
PROPERTIES
    Done
`;

describe('formal', () => {
  describe('equivalence', () => {
    it('一致の確認を先に回す', () => {
      expect(formalChecks().map((c) => c.module)).toEqual(['MachineConformance', 'Backend']);
    });

    it('TLC に設定ファイルと作業フォルダーを渡す', () => {
      const args = tlcArgs('t.jar', { module: 'Backend' }, '/tmp/x');
      expect(args).toContain('tlc2.TLC');
      expect(args.slice(args.indexOf('-config'), args.indexOf('-config') + 2)).toEqual([
        '-config',
        'Backend.cfg',
      ]);
      expect(args.slice(args.indexOf('-metadir'), args.indexOf('-metadir') + 2)).toEqual([
        '-metadir',
        '/tmp/x',
      ]);
      expect(args.at(-1)).toBe('Backend');
    });

    it('cfg から検査する性質の名前を取り出す', () => {
      expect(propertiesInCfg(CFG)).toEqual(['TypeOK', 'Safe', 'Done']);
    });
  });

  describe('boundary', () => {
    it('性質が無い cfg は空', () => {
      expect(propertiesInCfg('INIT Init\nNEXT Next\n')).toEqual([]);
      expect(propertiesInCfg('')).toEqual([]);
    });
  });
});
