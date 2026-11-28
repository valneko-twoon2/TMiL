import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brokenLinks, layoutProblems, localLinks } from './docs.mjs';

const GOOD = {
  'docs/README.md': '| [ci](ci/) | CI |',
  'docs/ci/README.md': '[01-pipeline.md](01-pipeline.md) [02-review.md](02-review.md)',
  'docs/ci/01-pipeline.md': '# CI',
  'docs/ci/02-review.md': '# レビュー',
};

const layout = (files) => layoutProblems(Object.keys(files), (p) => files[p] ?? '');

describe('docs の置き方', () => {
  describe('equivalence', () => {
    it('決まりどおりなら問題なし', () => {
      assert.deepEqual(layout(GOOD), []);
    });

    it('番号の無いファイル・重なった番号・README の案内漏れを見つける', () => {
      const problems = layout({
        ...GOOD,
        'docs/ci/notes.md': '',
        'docs/ci/02-other.md': '',
      });
      assert.equal(problems.length, 3, problems.join('\n'));
      assert.ok(problems.some((p) => p.includes('notes.md') && p.includes('番号')));
      assert.ok(problems.some((p) => p.includes('番号 02')));
      assert.ok(problems.some((p) => p.includes('02-other.md の案内')));
    });

    it('フォルダーの README が無い・目次に無いフォルダーを見つける', () => {
      const problems = layout({ ...GOOD, 'docs/extra/01-a.md': '' });
      assert.ok(problems.some((p) => p.includes('docs/extra/README.md がありません')));
      assert.ok(problems.some((p) => p.includes('extra/ の案内')));
    });
  });

  describe('boundary', () => {
    it('直下の README 以外のファイル・2 段のフォルダーは置けない', () => {
      const problems = layout({ ...GOOD, 'docs/a.md': '', 'docs/ci/sub/01-x.md': '' });
      assert.ok(problems.some((p) => p.includes('docs/a.md')));
      assert.ok(problems.some((p) => p.includes('1 段だけ')));
    });

    it('画像など .md 以外は数えない', () => {
      assert.deepEqual(
        layoutProblems([...Object.keys(GOOD), 'docs/images/a.png'], (p) => GOOD[p] ?? ''),
        [],
      );
    });

    it('docs/README.md が無ければ知らせる', () => {
      assert.ok(layoutProblems([], () => '').includes('docs/README.md がありません'));
    });

    it('番号は 2 桁、名前は英小文字とハイフンだけ', () => {
      const problems = layout({
        ...GOOD,
        'docs/ci/3-a.md': '',
        'docs/ci/04-Big.md': '',
        'docs/ci/05-a-.md': '',
      });
      assert.equal(problems.filter((p) => p.includes('2 桁の番号')).length, 3);
    });
  });
});

describe('docs のリンク', () => {
  describe('equivalence', () => {
    it('ファイルの場所から見た行き先にする', () => {
      assert.deepEqual(localLinks('docs/ci/01-a.md', '[x](../release/01-release.md#手順) [y](02-b.md)'), [
        { link: '../release/01-release.md#手順', target: 'docs/release/01-release.md' },
        { link: '02-b.md', target: 'docs/ci/02-b.md' },
      ]);
    });

    it('行き先が無いリンクを見つける', () => {
      const read = () => '[ok](01-a.md) [ng](09-none.md)';
      const exists = (p) => p === 'docs/ci/01-a.md';
      assert.deepEqual(brokenLinks(['docs/ci/README.md'], read, exists), [
        'docs/ci/README.md: リンク先がありません: 09-none.md',
      ]);
    });
  });

  describe('boundary', () => {
    it('URL・ページ内リンク・コードの中は数えない', () => {
      const content =
        '[a](https://x.example) [b](#見出し) [c](mailto:a@b) `[d](no.md)`\n```\n[e](no.md)\n```';
      assert.deepEqual(localLinks('README.md', content), []);
    });

    it('フォルダーへのリンクは末尾の / を除いて確かめる', () => {
      assert.deepEqual(localLinks('docs/README.md', '[ci](ci/)'), [{ link: 'ci/', target: 'docs/ci' }]);
    });
  });
});
