// CHANGELOG.md の読み書き（純粋関数）。
// 形式: "## [未リリース]" の下に書き溜め、リリース時に "## [x.y.z] - YYYY-MM-DD" に移す。

export const UNRELEASED = '## [未リリース]';
const HEADING = /^## \[/;

/** semver（x.y.z）か。 */
export function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/** a が b より大きいか。 */
export function isNewer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** 見出しの行番号から次の見出しまでの本文を返す。 */
function sectionBody(lines, start) {
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => HEADING.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** 指定バージョンの本文（見出しを除く）。無ければ null。 */
export function extractSection(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  return start === -1 ? null : sectionBody(lines, start);
}

/** 未リリースの内容を新しいバージョンの節に移す。未リリースが空なら例外。 */
export function releaseUnreleased(markdown, version, date) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === UNRELEASED);
  if (start === -1) throw new Error(`${UNRELEASED} の見出しがありません`);
  const body = sectionBody(lines, start);
  if (body === '') throw new Error('未リリースの変更が書かれていません');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => HEADING.test(l));
  const after = end === -1 ? [] : rest.slice(end);
  return [...lines.slice(0, start), UNRELEASED, '', `## [${version}] - ${date}`, '', body, '', ...after]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n*$/, '\n');
}
