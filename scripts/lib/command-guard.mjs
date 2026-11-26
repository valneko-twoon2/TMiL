// Claude Code が実行しようとしたコマンドのうち、禁止しているものを見つける。

/** @type {[RegExp, string][]} */
const RULES = [
  [/--no-verify\b/, 'git フックを飛ばす --no-verify は禁止です。Lint やメッセージを直してください。'],
  [/\bgit\b[^\n;&|]*\bcommit\b[^\n;&|]*\s-n\b/, 'git commit -n（フック回避）は禁止です。'],
  [/\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/, 'force push は禁止です。'],
  [
    /\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*\bmain\b/,
    'main へ直接 push しないでください。develop から PR を出します。',
  ],
  [
    /\bgit\b[^\n;&|]*\bconfig\b[^\n;&|]*(--unset(-all)?\s+core\.hooksPath|core\.hooksPath\s+(?!\.githooks\b)[^\s;&|-])/,
    'core.hooksPath は .githooks から変えないでください。',
  ],
  [/\bgit\b[^\n;&|]*\bcommit\b[\s\S]*co-authored-by/i, 'Co-Authored-By は付けないでください。'],
];

/**
 * 禁止されているコマンドなら理由を、問題なければ null を返す。
 * @param {string} command
 * @returns {string | null}
 */
export function checkCommand(command) {
  for (const [pattern, reason] of RULES) {
    if (pattern.test(command)) return reason;
  }
  return null;
}
