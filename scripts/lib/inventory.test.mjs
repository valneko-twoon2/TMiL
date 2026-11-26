import { describe, expect, it } from 'vitest';
import { buildInventory, kindOf, layerOf, renderInventory } from './inventory.mjs';

describe('inventory', () => {
  describe('equivalence', () => {
    it('名前のタグから種類を決める', () => {
      expect(kindOf({ runner: 'vitest', file: 'a', path: ['formatBytes', 'boundary', 'x'] })).toBe(
        'boundary',
      );
      expect(kindOf({ runner: 'cargo', file: 'a', path: ['metrics', 'tests', 'equivalence', 'x'] })).toBe(
        'equivalence',
      );
      expect(kindOf({ runner: 'cargo', file: 'a', path: ['contract', 'snapshot'] })).toBe('contract');
    });

    it('実行方法から種類を決める', () => {
      expect(kindOf({ runner: 'playwright', project: 'vrt', file: 'a', path: [] })).toBe('vrt');
      expect(kindOf({ runner: 'playwright', project: 'e2e-mock', file: 'a', path: [] })).toBe('e2e-mock');
      expect(kindOf({ runner: 'node-test', file: 'a', path: [] })).toBe('e2e-native');
      expect(kindOf({ runner: 'cargo-fuzz', file: 'a', path: [] })).toBe('fuzz');
    });

    it('対象を決める', () => {
      expect(layerOf({ runner: 'vitest', file: 'src/frontend/x.test.ts', path: [] })).toBe('frontend');
      expect(layerOf({ runner: 'vitest', file: 'scripts/lib/x.test.mjs', path: [] })).toBe('tooling');
      expect(layerOf({ runner: 'cargo', file: 'x', path: [] })).toBe('backend');
      expect(layerOf({ runner: 'node-test', file: 'x', path: [] })).toBe('app');
    });

    it('表と内訳を作る', () => {
      const inv = buildInventory([
        { runner: 'vitest', file: 'src/frontend/a.test.ts', path: ['a', 'boundary', 'x'] },
        { runner: 'vitest', file: 'src/frontend/a.test.ts', path: ['a', 'equivalence', 'y'] },
        { runner: 'cargo', file: 'metrics', path: ['metrics', 'tests', 'boundary', 'z'] },
      ]);
      const md = renderInventory(inv);
      expect(md).toContain('合計 **3** 件');
      expect(md).toContain('| 単体（境界値） | 1 | 1 | 0 | 0 | 2 |');
      expect(md).toContain('| `src/frontend/a.test.ts` | 2 | 単体（同値分割） 1 / 単体（境界値） 1 |');
      expect(md).toContain('## バックの内訳');
    });
  });

  describe('boundary', () => {
    it('タグが無ければ単体（その他）', () => {
      expect(kindOf({ runner: 'vitest', file: 'a', path: ['a', 'b'] })).toBe('unit');
    });

    it('テストが 0 件でも表は出す', () => {
      const md = renderInventory(buildInventory([]));
      expect(md).toContain('合計 **0** 件');
      expect(md).not.toContain('の内訳');
    });
  });
});
