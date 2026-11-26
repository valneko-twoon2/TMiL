// コミットメッセージの規約チェック。commit-msg フックと Claude のフックで共有する。

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

export const SUBJECT_MAX_LENGTH = 72;

const HEADER_PATTERN = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: \\S`);
const JAPANESE_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const CO_AUTHOR_PATTERN = /co-authored-by/i;

/** git が付けるコメント行と scissors 以降を取り除く。 */
export function stripComments(raw) {
  const lines = raw.split('\n');
  const scissors = lines.findIndex((l) => /^# -+ >8 -+$/.test(l));
  const body = scissors === -1 ? lines : lines.slice(0, scissors);
  return body
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();
}

/**
 * コミットメッセージを検査し、違反内容の配列を返す（空なら合格）。
 * @param {string} raw
 * @returns {string[]}
 */
export function validateCommitMessage(raw) {
  const errors = [];
  if (raw.includes('\r')) errors.push('改行コードは LF にしてください（CR が含まれています）');

  const message = stripComments(raw.replaceAll('\r', ''));
  if (message.length === 0) return ['メッセージが空です'];

  const [subject = '', second] = message.split('\n');

  // git が自動で作るメッセージは対象外
  if (/^Merge (branch|remote-tracking branch|pull request) /.test(subject)) return errors;
  if (/^(fixup|squash|amend)! /.test(subject)) return errors;

  if (!HEADER_PATTERN.test(subject)) {
    errors.push(`1 行目は「種別: 内容」の形にしてください（種別: ${COMMIT_TYPES.join(', ')}）`);
  }
  if (!JAPANESE_PATTERN.test(subject)) errors.push('1 行目は日本語で書いてください');
  if ([...subject].length > SUBJECT_MAX_LENGTH) {
    errors.push(`1 行目は ${String(SUBJECT_MAX_LENGTH)} 文字以内にしてください`);
  }
  if (second !== undefined && second !== '') {
    errors.push('1 行目と本文の間は空行にしてください');
  }
  if (CO_AUTHOR_PATTERN.test(message)) errors.push('Co-Authored-By は付けないでください');
  return errors;
}
