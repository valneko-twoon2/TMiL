// テストの設定そのものを確かめる。
import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

describe('Vitest の設定', () => {
  describe('regression', () => {
    // ミューテーションテスト（Stryker）が .stryker-tmp に置いた元のファイルの写しまでテストとして読み、始まらなかった
    it('.stryker-tmp の中はテストとして拾わない', () => {
      expect(config.test?.exclude).toContain('.stryker-tmp/**');
      expect(config.test?.exclude).toContain('**/node_modules/**');
    });
  });
});
