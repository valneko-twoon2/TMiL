import { describe, expect, it } from 'vitest';
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
      expect(extractSection(SAMPLE, '0.1.0')).toBe('### 追加\n- 最初の版');
    });

    it('未リリースを新しいバージョンに移す', () => {
      const next = releaseUnreleased(SAMPLE, '0.2.0', '2026-12-01');
      expect(next).toContain('## [未リリース]\n\n## [0.2.0] - 2026-12-01\n\n### 追加\n- 検索\n\n## [0.1.0]');
      expect(extractSection(next, '0.2.0')).toBe('### 追加\n- 検索');
      expect(next.endsWith('- 最初の版\n')).toBe(true);
    });

    it('バージョンの比較', () => {
      expect(isNewer('0.2.0', '0.1.9')).toBe(true);
      expect(isNewer('1.0.0', '0.99.99')).toBe(true);
      expect(isNewer('0.1.0', '0.1.0')).toBe(false);
      expect(isNewer('0.1.0', '0.2.0')).toBe(false);
    });

    it('semver の判定', () => {
      expect(isSemver('1.2.3')).toBe(true);
      expect(isSemver('v1.2.3')).toBe(false);
      expect(isSemver('1.2')).toBe(false);
    });
  });

  describe('boundary', () => {
    it('無いバージョンは null', () => {
      expect(extractSection(SAMPLE, '9.9.9')).toBeNull();
    });

    it('未リリースが空ならリリースできない', () => {
      const empty = '# 変更履歴\n\n## [未リリース]\n\n## [0.1.0] - 2026-11-27\n\n- a\n';
      expect(() => releaseUnreleased(empty, '0.2.0', '2026-12-01')).toThrow('書かれていません');
    });

    it('未リリースの見出しが無ければ失敗', () => {
      expect(() => releaseUnreleased('# 変更履歴\n', '0.2.0', '2026-12-01')).toThrow('見出し');
    });

    it('過去の版が無くても動く', () => {
      const first = '# 変更履歴\n\n## [未リリース]\n\n- 最初\n';
      expect(releaseUnreleased(first, '0.1.0', '2026-11-27')).toBe(
        '# 変更履歴\n\n## [未リリース]\n\n## [0.1.0] - 2026-11-27\n\n- 最初\n',
      );
    });
  });
});
