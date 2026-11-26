import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SUBJECT_MAX_LENGTH, stripComments, validateCommitMessage } from './commit-message.mjs';

describe('validateCommitMessage', () => {
  describe('equivalence', () => {
    for (const message of [
      'feat: 検索を追加',
      'fix(core): 落ちる不具合を修正',
      'refactor!: 設定の形を変更',
      'chore(deps): 依存を更新',
    ]) {
      it(`正しい形式: ${message}`, () => {
        assert.deepEqual(validateCommitMessage(message), []);
      });
    }

    it('種別が無いと失敗する', () => {
      assert.ok(validateCommitMessage('検索を追加').join().includes('種別'));
    });

    it('知らない種別は失敗する', () => {
      assert.ok(validateCommitMessage('feature: 検索を追加').join().includes('種別'));
    });

    it('英語だけのメッセージは失敗する', () => {
      assert.ok(validateCommitMessage('feat: add search').join().includes('日本語'));
    });

    it('Co-Authored-By を拒否する', () => {
      const message = 'feat: 検索を追加\n\nCo-authored-by: someone <a@example.com>';
      assert.ok(validateCommitMessage(message).join().includes('Co-Authored-By'));
    });

    it('本文の前に空行が無いと失敗する', () => {
      assert.ok(validateCommitMessage('feat: 検索を追加\n本文').join().includes('空行'));
    });

    it('本文付きでも正しければ通る', () => {
      assert.deepEqual(validateCommitMessage('feat: 検索を追加\n\n詳しい説明'), []);
    });

    it('git が作るマージコミットは対象外', () => {
      assert.deepEqual(validateCommitMessage("Merge branch 'develop'"), []);
    });

    it('fixup! は対象外', () => {
      assert.deepEqual(validateCommitMessage('fixup! feat: 検索を追加'), []);
    });
  });

  describe('boundary', () => {
    it('空のメッセージは失敗する', () => {
      assert.deepEqual(validateCommitMessage(''), ['メッセージが空です']);
      assert.deepEqual(validateCommitMessage('# コメントだけ\n'), ['メッセージが空です']);
    });

    it(`1 行目は ${String(SUBJECT_MAX_LENGTH)} 文字ちょうどまで通る`, () => {
      const subject = 'feat: ' + 'あ'.repeat(SUBJECT_MAX_LENGTH - 'feat: '.length);
      assert.deepEqual(validateCommitMessage(subject), []);
      assert.ok(
        validateCommitMessage(subject + 'あ')
          .join()
          .includes('文字以内'),
      );
    });

    it('CR を含むと失敗する', () => {
      assert.ok(validateCommitMessage('feat: 検索を追加\r\n').join().includes('LF'));
    });

    it('コロンの後に空白が無いと失敗する', () => {
      assert.ok(validateCommitMessage('feat:検索を追加').join().includes('種別'));
    });
  });
});

describe('stripComments', () => {
  describe('equivalence', () => {
    it('# 行と scissors 以降を除く', () => {
      const raw = 'feat: 追加\n# コメント\n# ------------------------ >8 ------------------------\ndiff';
      assert.equal(stripComments(raw), 'feat: 追加');
    });
  });
});
