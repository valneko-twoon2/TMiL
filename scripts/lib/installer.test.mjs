import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sha256sums } from './installer.mjs';

describe('sha256sums', () => {
  describe('equivalence', () => {
    it('sha256sum と同じ「ハッシュ・空白 2 つ・名前」の形で、名前の順に並べる', () => {
      assert.equal(sha256sums({ 'b.exe': 'bb', 'a.AppImage': 'aa' }), 'aa  a.AppImage\nbb  b.exe\n');
    });
  });

  describe('boundary', () => {
    it('ファイルが無ければ空', () => {
      assert.equal(sha256sums({}), '');
    });
  });
});
