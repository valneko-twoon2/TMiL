import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planTests, rustFilterFor } from './related.mjs';

describe('rustFilterFor', () => {
  describe('equivalence', () => {
    for (const [file, filter] of [
      ['src/backend/core/src/startup/desktop.rs', 'startup::desktop::'],
      ['src/backend/core/src/startup/mod.rs', 'startup::'],
      ['src/backend/core/src/collector.rs', 'collector::'],
      ['src/backend/core/tests/contract.rs', 'contract::'],
    ]) {
      it(`${file} → ${filter}`, () => {
        assert.equal(rustFilterFor(file), filter);
      });
    }

    it('lib.rs や Cargo.toml は全体を回す', () => {
      assert.equal(rustFilterFor('src/backend/core/src/lib.rs'), '');
      assert.equal(rustFilterFor('Cargo.toml'), '');
      assert.equal(rustFilterFor('src/backend/core/Cargo.toml'), '');
      assert.equal(rustFilterFor('tests/contract/fixtures/snapshot.json'), '');
    });

    it('フロントのファイルは対象外', () => {
      assert.equal(rustFilterFor('src/frontend/lib/format/format.ts'), null);
      assert.equal(rustFilterFor('src/backend/app/src/main.rs'), null);
    });
  });

  describe('boundary', () => {
    it('Windows 区切りのパスも扱う', () => {
      assert.equal(rustFilterFor(String.raw`src\backend\core\src\metrics.rs`), 'metrics::');
    });
  });
});

describe('planTests', () => {
  describe('equivalence', () => {
    it('フロントとバックの変更を振り分ける', () => {
      const plan = planTests([
        'src/frontend/lib/format/format.ts',
        'src/frontend/lib/pages/ProcessesPage.svelte',
        'src/backend/core/src/metrics.rs',
        'docs/README.md',
      ]);
      assert.deepEqual(plan.frontend, [
        'src/frontend/lib/format/format.ts',
        'src/frontend/lib/pages/ProcessesPage.svelte',
      ]);
      assert.deepEqual(plan.rustFilters, ['metrics::']);
      assert.equal(plan.uiChanged, true);
      assert.equal(plan.backendChanged, true);
      assert.equal(plan.contract, false);
      assert.equal(plan.tools, false);
    });

    it('scripts/ を変えたらツールのテストを回す（Vitest には渡さない）', () => {
      const plan = planTests(['scripts/lib/files.mjs']);
      assert.equal(plan.tools, true);
      assert.deepEqual(plan.frontend, []);
    });

    it('状態機械や TLA+ を変えたら形式検証を案内する', () => {
      assert.equal(planTests(['src/backend/core/src/machine/mod.rs']).formalChanged, true);
      assert.equal(planTests(['tests/formal/Backend.tla']).formalChanged, true);
      assert.equal(planTests(['src/backend/core/src/metrics.rs']).formalChanged, false);
    });

    it('インストール スクリプトを変えたら、そのテストを回す', () => {
      assert.equal(planTests(['src/installer/install.ps1']).installer, true);
      assert.equal(planTests(['scripts/test/installer.mjs']).installer, true);
      assert.equal(planTests(['src/frontend/lib/format/format.ts']).installer, false);
    });

    it('型や契約が変わったら契約テストも回す', () => {
      assert.equal(planTests(['src/backend/core/src/model.rs']).contract, true);
      assert.equal(planTests(['src/frontend/lib/model/types.ts']).contract, true);
      assert.equal(planTests(['src/frontend/lib/model/guards.ts']).contract, true);
    });
  });

  describe('boundary', () => {
    it('全体を回すときは個別の絞り込みをまとめる', () => {
      const plan = planTests(['src/backend/Cargo.lock', 'src/backend/core/src/metrics.rs']);
      assert.deepEqual(plan.rustFilters, ['']);
    });

    it('変更なし', () => {
      const plan = planTests([]);
      assert.deepEqual(plan.frontend, []);
      assert.deepEqual(plan.rustFilters, []);
    });
  });
});
