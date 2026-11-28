import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { combineStatus } from './proc.mjs';

describe('combineStatus', () => {
  describe('equivalence', () => {
    it('すべて成功なら 0', () => {
      assert.equal(combineStatus([0, 0]), 0);
    });

    it('失敗があれば最初の失敗', () => {
      assert.equal(combineStatus([0, 2, 1]), 2);
    });
  });

  describe('boundary', () => {
    it('空なら 0', () => {
      assert.equal(combineStatus([]), 0);
    });
  });

  describe('regression', () => {
    // ミューテーションテストで、バックが失敗するとフロントが実行されなかった（||= の短絡）
    it('先に失敗があっても後ろの結果を受け取ってからまとめる', () => {
      const ran = [];
      const statuses = [1, 0].map((s) => {
        ran.push(s);
        return s;
      });
      assert.deepEqual(ran, [1, 0]);
      assert.equal(combineStatus(statuses), 1);
    });
  });
});
