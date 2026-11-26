import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractSection, isNewer, isSemver, releaseUnreleased } from './changelog.mjs';

const SAMPLE = `# 変更履歴

## [未リリース]

### 追加
- 検索

## [0.1.0] - 2026-11-27

### 追加
- 最初の版
`;

describe('changelog', () => {
  describe('equivalence', () => {
    it('指定バージョンの本文を取り出す', () => {
      assert.equal(extractSection(SAMPLE, '0.1.0'), '### 追加\n- 最初の版');
    });

    it('未リリースを新しいバージョンに移す', () => {
      const next = releaseUnreleased(SAMPLE, '0.2.0', '2026-12-01');
      assert.ok(
        next.includes('## [未リリース]\n\n## [0.2.0] - 2026-12-01\n\n### 追加\n- 検索\n\n## [0.1.0]'),
      );
      assert.equal(extractSection(next, '0.2.0'), '### 追加\n- 検索');
      assert.equal(next.endsWith('- 最初の版\n'), true);
    });

    it('バージョンの比較', () => {
      assert.equal(isNewer('0.2.0', '0.1.9'), true);
      assert.equal(isNewer('1.0.0', '0.99.99'), true);
      assert.equal(isNewer('0.1.0', '0.1.0'), false);
      assert.equal(isNewer('0.1.0', '0.2.0'), false);
    });

    it('semver の判定', () => {
      assert.equal(isSemver('1.2.3'), true);
      assert.equal(isSemver('v1.2.3'), false);
      assert.equal(isSemver('1.2'), false);
    });
  });

  describe('boundary', () => {
    it('無いバージョンは null', () => {
      assert.equal(extractSection(SAMPLE, '9.9.9'), null);
    });

    it('未リリースが空ならリリースできない', () => {
      const empty = '# 変更履歴\n\n## [未リリース]\n\n## [0.1.0] - 2026-11-27\n\n- a\n';
      assert.throws(() => releaseUnreleased(empty, '0.2.0', '2026-12-01'), /書かれていません/);
    });

    it('未リリースの見出しが無ければ失敗', () => {
      assert.throws(() => releaseUnreleased('# 変更履歴\n', '0.2.0', '2026-12-01'), /見出し/);
    });

    it('過去の版が無くても動く', () => {
      const first = '# 変更履歴\n\n## [未リリース]\n\n- 最初\n';
      assert.equal(
        releaseUnreleased(first, '0.1.0', '2026-11-27'),
        '# 変更履歴\n\n## [未リリース]\n\n## [0.1.0] - 2026-11-27\n\n- 最初\n',
      );
    });
  });
});
