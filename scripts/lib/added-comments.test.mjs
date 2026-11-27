import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeViolations, isChecked, unmarkedComments } from './added-comments.mjs';

const diff = (file, ...lines) =>
  `+++ b/${file}\n@@ -1,0 +5,${String(lines.length)} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;

describe('unmarkedComments', () => {
  describe('equivalence', () => {
    it('印の無いコメントを見つけ、行番号を付ける', () => {
      const found = unmarkedComments(diff('src/frontend/lib/a.ts', 'const a = 1;', '// 1 を入れる'));
      assert.deepEqual(found, [{ file: 'src/frontend/lib/a.ts', line: 6, text: '// 1 を入れる' }]);
    });

    it('印があれば通す（Rust の /// も、Svelte の <!-- も）', () => {
      for (const [file, line] of [
        ['src/backend/core/src/a.rs', '/// なぜ: UAC を取り消すと失敗する'],
        ['src/frontend/lib/a.ts', '// 契約: 単位はミリ秒'],
        ['src/frontend/lib/A.svelte', '<!-- なぜ: 入力欄は dialog の中 -->'],
      ]) {
        assert.deepEqual(unmarkedComments(diff(file, line)), []);
      }
    });

    it('塊は先頭の行だけ見る', () => {
      assert.deepEqual(unmarkedComments(diff('src/frontend/lib/a.ts', '// なぜ: 理由', '// 続き')), []);
      assert.equal(unmarkedComments(diff('src/frontend/lib/a.ts', '// 先頭', '// なぜ: 2 行目')).length, 1);
    });
  });

  describe('boundary', () => {
    it('テスト・設定・指示のコメントは見ない', () => {
      assert.deepEqual(unmarkedComments(diff('src/frontend/lib/a.test.ts', '// 説明')), []);
      assert.deepEqual(unmarkedComments(diff('tests/e2e/a.ts', '// 説明')), []);
      assert.deepEqual(unmarkedComments(diff('scripts/a.mjs', '// 説明')), []);
      assert.deepEqual(unmarkedComments(diff('src/frontend/lib/a.ts', '// eslint-disable-next-line x')), []);
      assert.deepEqual(unmarkedComments(diff('src/frontend/lib/a.ts', '// @ts-expect-error x')), []);
    });

    it('消した行と空の差分は見ない', () => {
      assert.deepEqual(unmarkedComments(''), []);
      assert.deepEqual(unmarkedComments('+++ b/src/frontend/lib/a.ts\n@@ -1 +0,0 @@\n-// 消した\n'), []);
    });

    it('対象は src のソースだけ', () => {
      assert.equal(isChecked('src/backend/core/src/a.rs'), true);
      assert.equal(isChecked('src/backend/core/src/machine/tests.rs'), false);
      assert.equal(isChecked('docs/a.md'), false);
    });
  });

  describe('regression', () => {
    // 作業のたびに「何をするか」の説明が積み上がり、まとめて 851 行を消した
    it('処理を言い直しただけのコメントは止める', () => {
      const found = unmarkedComments(
        diff('src/backend/core/src/a.rs', '/// 優先度を変える。', 'fn set() {}'),
      );
      assert.equal(describeViolations(found).length, 3);
    });
  });
});
