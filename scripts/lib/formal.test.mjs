import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
      assert.deepEqual(
        formalChecks().map((c) => c.module),
        ['MachineConformance', 'Backend'],
      );
    });

    it('TLC に設定ファイルと作業フォルダーを渡す', () => {
      const args = tlcArgs('t.jar', { module: 'Backend', config: 'Backend.cfg' }, '/tmp/x');
      assert.ok(args.includes('tlc2.TLC'));
      assert.deepEqual(args.slice(args.indexOf('-config'), args.indexOf('-config') + 2), [
        '-config',
        'Backend.cfg',
      ]);
      assert.deepEqual(args.slice(args.indexOf('-metadir'), args.indexOf('-metadir') + 2), [
        '-metadir',
        '/tmp/x',
      ]);
      assert.equal(args.at(-1), 'Backend');
      // v1.7.4 の TLC には -noGenerateSpecTE が無く、付けると起動しない
      assert.ok(!args.includes('-noGenerateSpecTE'));
    });

    it('cfg から検査する性質の名前を取り出す', () => {
      assert.deepEqual(propertiesInCfg(CFG), ['TypeOK', 'Safe', 'Done']);
    });
  });

  describe('boundary', () => {
    it('性質が無い cfg は空', () => {
      assert.deepEqual(propertiesInCfg('INIT Init\nNEXT Next\n'), []);
      assert.deepEqual(propertiesInCfg(''), []);
    });
  });

  describe('regression', () => {
    it('不具合版は違反名ごとに 1 つずつ、Regressions.tla で回す', () => {
      const checks = regressionChecks();
      assert.equal(checks.length, 8);
      assert.equal(new Set(checks.map((c) => c.expect)).size, checks.length);
      assert.equal(
        checks.every((c) => c.module === 'Regressions' && c.config.startsWith('regressions/')),
        true,
      );
    });

    it('TLC が失敗し、期待した違反名が反例に出たときだけ合格', () => {
      const out = String.raw`Error: Invariant Safe is violated.
/\ violation = "killedProtected"`;
      assert.equal(regressionDetected(12, out, 'killedProtected'), true);
      assert.equal(regressionDetected(0, out, 'killedProtected'), false);
      assert.equal(regressionDetected(12, out, 'overlappingSamples'), false);
      assert.equal(regressionDetected(12, 'Error: parse error', 'killedProtected'), false);
    });
  });
});
