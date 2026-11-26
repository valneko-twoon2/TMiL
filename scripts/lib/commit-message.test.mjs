import { describe, expect, it } from 'vitest';
import { SUBJECT_MAX_LENGTH, stripComments, validateCommitMessage } from './commit-message.mjs';

describe('validateCommitMessage', () => {
  describe('equivalence', () => {
    it.each([
      'feat: 検索を追加',
      'fix(core): 落ちる不具合を修正',
      'refactor!: 設定の形を変更',
      'chore(deps): 依存を更新',
    ])('正しい形式: %s', (message) => {
      expect(validateCommitMessage(message)).toEqual([]);
    });

    it('種別が無いと失敗する', () => {
      expect(validateCommitMessage('検索を追加').join()).toContain('種別');
    });

    it('知らない種別は失敗する', () => {
      expect(validateCommitMessage('feature: 検索を追加').join()).toContain('種別');
    });

    it('英語だけのメッセージは失敗する', () => {
      expect(validateCommitMessage('feat: add search').join()).toContain('日本語');
    });

    it('Co-Authored-By を拒否する', () => {
      const message = 'feat: 検索を追加\n\nCo-authored-by: someone <a@example.com>';
      expect(validateCommitMessage(message).join()).toContain('Co-Authored-By');
    });

    it('本文の前に空行が無いと失敗する', () => {
      expect(validateCommitMessage('feat: 検索を追加\n本文').join()).toContain('空行');
    });

    it('本文付きでも正しければ通る', () => {
      expect(validateCommitMessage('feat: 検索を追加\n\n詳しい説明')).toEqual([]);
    });

    it('git が作るマージコミットは対象外', () => {
      expect(validateCommitMessage("Merge branch 'develop'")).toEqual([]);
    });

    it('fixup! は対象外', () => {
      expect(validateCommitMessage('fixup! feat: 検索を追加')).toEqual([]);
    });
  });

  describe('boundary', () => {
    it('空のメッセージは失敗する', () => {
      expect(validateCommitMessage('')).toEqual(['メッセージが空です']);
      expect(validateCommitMessage('# コメントだけ\n')).toEqual(['メッセージが空です']);
    });

    it(`1 行目は ${String(SUBJECT_MAX_LENGTH)} 文字ちょうどまで通る`, () => {
      const subject = 'feat: ' + 'あ'.repeat(SUBJECT_MAX_LENGTH - 'feat: '.length);
      expect(validateCommitMessage(subject)).toEqual([]);
      expect(validateCommitMessage(subject + 'あ').join()).toContain('文字以内');
    });

    it('CR を含むと失敗する', () => {
      expect(validateCommitMessage('feat: 検索を追加\r\n').join()).toContain('LF');
    });

    it('コロンの後に空白が無いと失敗する', () => {
      expect(validateCommitMessage('feat:検索を追加').join()).toContain('種別');
    });
  });
});

describe('stripComments', () => {
  describe('equivalence', () => {
    it('# 行と scissors 以降を除く', () => {
      const raw = 'feat: 追加\n# コメント\n# ------------------------ >8 ------------------------\ndiff';
      expect(stripComments(raw)).toBe('feat: 追加');
    });
  });
});
