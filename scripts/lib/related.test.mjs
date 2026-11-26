import { describe, expect, it } from 'vitest';
import { planTests, rustFilterFor } from './related.mjs';

describe('rustFilterFor', () => {
  describe('equivalence', () => {
    it.each([
      ['src/backend/core/src/startup/desktop.rs', 'startup::desktop::'],
      ['src/backend/core/src/startup/mod.rs', 'startup::'],
      ['src/backend/core/src/collector.rs', 'collector::'],
      ['src/backend/core/tests/contract.rs', 'contract::'],
    ])('%s → %s', (file, filter) => {
      expect(rustFilterFor(file)).toBe(filter);
    });

    it('lib.rs や Cargo.toml は全体を回す', () => {
      expect(rustFilterFor('src/backend/core/src/lib.rs')).toBe('');
      expect(rustFilterFor('Cargo.toml')).toBe('');
      expect(rustFilterFor('src/backend/core/Cargo.toml')).toBe('');
      expect(rustFilterFor('tests/contract/fixtures/snapshot.json')).toBe('');
    });

    it('フロントのファイルは対象外', () => {
      expect(rustFilterFor('src/frontend/lib/format/format.ts')).toBeNull();
      expect(rustFilterFor('src/backend/app/src/main.rs')).toBeNull();
    });
  });

  describe('boundary', () => {
    it('Windows 区切りのパスも扱う', () => {
      expect(rustFilterFor(String.raw`src\backend\core\src\metrics.rs`)).toBe('metrics::');
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
      expect(plan.frontend).toEqual([
        'src/frontend/lib/format/format.ts',
        'src/frontend/lib/pages/ProcessesPage.svelte',
      ]);
      expect(plan.rustFilters).toEqual(['metrics::']);
      expect(plan.uiChanged).toBe(true);
      expect(plan.backendChanged).toBe(true);
      expect(plan.contract).toBe(false);
    });

    it('状態機械や TLA+ を変えたら形式検証を案内する', () => {
      expect(planTests(['src/backend/core/src/machine/mod.rs']).formalChanged).toBe(true);
      expect(planTests(['tests/formal/Backend.tla']).formalChanged).toBe(true);
      expect(planTests(['src/backend/core/src/metrics.rs']).formalChanged).toBe(false);
    });

    it('型や契約が変わったら契約テストも回す', () => {
      expect(planTests(['src/backend/core/src/model.rs']).contract).toBe(true);
      expect(planTests(['src/frontend/lib/model/types.ts']).contract).toBe(true);
      expect(planTests(['src/frontend/lib/model/guards.ts']).contract).toBe(true);
    });
  });

  describe('boundary', () => {
    it('全体を回すときは個別の絞り込みをまとめる', () => {
      const plan = planTests(['Cargo.lock', 'src/backend/core/src/metrics.rs']);
      expect(plan.rustFilters).toEqual(['']);
    });

    it('変更なし', () => {
      const plan = planTests([]);
      expect(plan.frontend).toEqual([]);
      expect(plan.rustFilters).toEqual([]);
    });
  });
});
