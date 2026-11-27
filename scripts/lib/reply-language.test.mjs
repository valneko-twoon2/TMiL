import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isMostlyEnglish, lastAssistantText } from './reply-language.mjs';

const english =
  'I removed the comments from 98 files and the lint passes. The remaining comments explain OS quirks and the contracts between the frontend and the backend, so they stay.';

describe('isMostlyEnglish', () => {
  describe('equivalence', () => {
    it('英語だけの長い返答は止める', () => {
      assert.equal(isMostlyEnglish(english), true);
    });
    it('日本語の返答は通す（英単語やコマンドが混ざってもよい）', () => {
      assert.equal(
        isMostlyEnglish('98 ファイルのコメントを消しました。`npm run lint` と clippy は通りました。'),
        false,
      );
    });
  });

  describe('boundary', () => {
    it('短い返答・空は通す', () => {
      assert.equal(isMostlyEnglish('OK'), false);
      assert.equal(isMostlyEnglish(''), false);
    });
    it('コード・URL・パスだけの英字は数えない', () => {
      const code = `${'```'}\n${english}\n${'```'}\n日本語の説明です。`;
      assert.equal(isMostlyEnglish(code), false);
      assert.equal(isMostlyEnglish(`https://example.com/${'a'.repeat(200)} 見てください`), false);
    });
  });

  describe('regression', () => {
    // 報告を英語で書いてしまい、「日本語で答えて」と言い直させた
    it('日本語が少し混ざるだけの英語の報告も止める', () => {
      assert.equal(isMostlyEnglish(`${english} 以上です。`), true);
    });
  });
});

describe('lastAssistantText', () => {
  const entry = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } });
  it('最後の assistant の文章を返し、文章の無い記録は飛ばす', () => {
    const tool = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } });
    const log = [entry('assistant', '前'), entry('user', '質問'), entry('assistant', '後'), tool].join('\n');
    assert.equal(lastAssistantText(log), '後');
  });
  it('壊れた行や空は空文字', () => {
    assert.equal(lastAssistantText('{壊れ\n'), '');
    assert.equal(lastAssistantText(''), '');
  });
});
