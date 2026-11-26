import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInventory, kindOf, layerOf, parseJunit, renderInventory } from './inventory.mjs';

const JUNIT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testsuite name="checkCommand" time="0.1" tests="2">
		<testsuite name="equivalence" time="0.1" tests="1">
			<testcase name="止める: git commit -m &quot;x&quot;" time="0.1" classname="test" file="E:\\TMiL\\scripts\\lib\\a.test.mjs"/>
		</testsuite>
		<testcase name="直下のテスト" time="0.1" classname="test" file="E:\\TMiL\\scripts\\lib\\a.test.mjs"/>
	</testsuite>
	<testcase name="describe の外" time="0.1" classname="test" file="/repo/scripts/lib/b.test.mjs"/>
</testsuites>`;

describe('inventory', () => {
  describe('equivalence', () => {
    it('名前のタグから種類を決める', () => {
      assert.equal(
        kindOf({ runner: 'vitest', file: 'a', path: ['formatBytes', 'boundary', 'x'] }),
        'boundary',
      );
      assert.equal(
        kindOf({ runner: 'cargo', file: 'a', path: ['metrics', 'tests', 'equivalence', 'x'] }),
        'equivalence',
      );
      assert.equal(kindOf({ runner: 'cargo', file: 'a', path: ['contract', 'snapshot'] }), 'contract');
    });

    it('実行方法から種類を決める', () => {
      assert.equal(kindOf({ runner: 'playwright', project: 'vrt', file: 'a', path: [] }), 'vrt');
      assert.equal(kindOf({ runner: 'playwright', project: 'e2e-mock', file: 'a', path: [] }), 'e2e-mock');
      assert.equal(
        kindOf({ runner: 'node-test', file: 'tests/e2e/native/app.test.mjs', path: [] }),
        'e2e-native',
      );
      assert.equal(kindOf({ runner: 'cargo-fuzz', file: 'a', path: [] }), 'fuzz');
      assert.equal(kindOf({ runner: 'tlc', file: 'a', path: [] }), 'formal');
      assert.equal(
        kindOf({ runner: 'cargo', file: 'a', path: ['machine', 'tests', 'formal', 'x'] }),
        'formal',
      );
    });

    it('scripts/ の node:test はタグで種類を決める', () => {
      const c = { runner: 'node-test', file: 'scripts/lib/a.test.mjs', path: ['a', 'regression', 'x'] };
      assert.equal(kindOf(c), 'regression');
      assert.equal(layerOf(c), 'tooling');
    });

    it('対象を決める', () => {
      assert.equal(layerOf({ runner: 'vitest', file: 'src/frontend/x.test.ts', path: [] }), 'frontend');
      assert.equal(layerOf({ runner: 'cargo', file: 'x', path: [] }), 'backend');
      assert.equal(layerOf({ runner: 'node-test', file: 'tests/e2e/native/x.test.mjs', path: [] }), 'app');
      assert.equal(layerOf({ runner: 'tlc', file: 'x', path: [] }), 'backend');
    });

    it('JUnit の出力から describe の入れ子とファイルを取り出す', () => {
      assert.deepEqual(parseJunit(JUNIT), [
        {
          file: 'E:\\TMiL\\scripts\\lib\\a.test.mjs',
          path: ['checkCommand', 'equivalence', '止める: git commit -m "x"'],
        },
        { file: 'E:\\TMiL\\scripts\\lib\\a.test.mjs', path: ['checkCommand', '直下のテスト'] },
        { file: '/repo/scripts/lib/b.test.mjs', path: ['describe の外'] },
      ]);
    });

    it('表と内訳を作る', () => {
      const inv = buildInventory([
        { runner: 'vitest', file: 'src/frontend/a.test.ts', path: ['a', 'boundary', 'x'] },
        { runner: 'vitest', file: 'src/frontend/a.test.ts', path: ['a', 'equivalence', 'y'] },
        { runner: 'cargo', file: 'metrics', path: ['metrics', 'tests', 'boundary', 'z'] },
      ]);
      const md = renderInventory(inv);
      assert.ok(md.includes('合計 **3** 件'));
      assert.ok(md.includes('| 単体（境界値） | 1 | 1 | 0 | 0 | 2 |'));
      assert.ok(md.includes('| `src/frontend/a.test.ts` | 2 | 単体（同値分割） 1 / 単体（境界値） 1 |'));
      assert.ok(md.includes('## バックの内訳'));
    });
  });

  describe('boundary', () => {
    it('タグが無ければ単体（その他）', () => {
      assert.equal(kindOf({ runner: 'vitest', file: 'a', path: ['a', 'b'] }), 'unit');
    });

    it('テストが 0 件でも表は出す', () => {
      const md = renderInventory(buildInventory([]));
      assert.ok(md.includes('合計 **0** 件'));
      assert.ok(!md.includes('の内訳'));
    });

    it('JUnit の出力が空なら 0 件', () => {
      assert.deepEqual(parseJunit(''), []);
    });
  });
});
