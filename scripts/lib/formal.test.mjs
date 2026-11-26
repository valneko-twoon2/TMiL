import { describe, expect, it } from 'vitest';
import { formalChecks, propertiesInCfg, regressionChecks, regressionDetected, tlcArgs } from './formal.mjs';

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

describe('TLA+ の検査設定', () => {
  describe('equivalence', () => {
    it('一致の確認を先に回す', () => {
      expect(formalChecks().map((c) => c.module)).toEqual(['MachineConformance', 'Backend']);
    });

    it('TLC に設定ファイルと作業フォルダーを渡す', () => {
      const args = tlcArgs('t.jar', { module: 'Backend', config: 'Backend.cfg' }, '/tmp/x');
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
      // v1.7.4 の TLC には -noGenerateSpecTE が無く、付けると起動しない
      expect(args).not.toContain('-noGenerateSpecTE');
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

  describe('regression', () => {
    it('不具合版は違反名ごとに 1 つずつ、Regressions.tla で回す', () => {
      const checks = regressionChecks();
      expect(checks.length).toBe(8);
      expect(new Set(checks.map((c) => c.expect)).size).toBe(checks.length);
      expect(checks.every((c) => c.module === 'Regressions' && c.config.startsWith('regressions/'))).toBe(
        true,
      );
    });

    it('TLC が失敗し、期待した違反名が反例に出たときだけ合格', () => {
      const out = String.raw`Error: Invariant Safe is violated.
/\ violation = "killedProtected"`;
      expect(regressionDetected(12, out, 'killedProtected')).toBe(true);
      expect(regressionDetected(0, out, 'killedProtected')).toBe(false);
      expect(regressionDetected(12, out, 'overlappingSamples')).toBe(false);
      expect(regressionDetected(12, 'Error: parse error', 'killedProtected')).toBe(false);
    });
  });
});
