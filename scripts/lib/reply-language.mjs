// 返答が日本語かを調べる（純粋関数）。コード・URL・パスは数えない。
const MIN_LETTERS = 80;
const MAX_LATIN_SHARE = 0.85;

/** @param {string} text */
export function stripNonProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:[/][/]\S+/g, ' ')
    .replace(/[A-Za-z]:[/\\][^\s]*|(?:[\w.-]+[/\\])+[\w.-]+/g, ' ');
}

/** 英語だけで長く書いていたら true。短い返答（コマンド名だけなど）は許す。 */
export function isMostlyEnglish(text) {
  const prose = stripNonProse(text);
  const latin = (prose.match(/[A-Za-z]/g) ?? []).length;
  const japanese = (prose.match(/[぀-ヿ㐀-鿿]/g) ?? []).length;
  if (latin < MIN_LETTERS) return false;
  return latin / (latin + japanese) > MAX_LATIN_SHARE;
}

/**
 * 記録（JSONL）の最後の assistant の文章を取り出す。
 * @param {string} transcript
 */
export function lastAssistantText(transcript) {
  const lines = transcript.split('\n').filter((l) => l.trim() !== '');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type !== 'assistant') continue;
      const content = entry.message?.content;
      const text = Array.isArray(content)
        ? content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n')
        : '';
      if (text.trim() !== '') return text;
    } catch {
      // 壊れた行は飛ばす
    }
  }
  return '';
}
