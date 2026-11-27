// 差分で足されたコメントを調べる（純粋関数）。
// 説明のコメントは、コードの名前や型で言えない「なぜ」だけに絞る。足すときは先頭に印を付けて、意図して書いたと分かるようにする。

/** コメントの先頭に付ける印。 */
export const MARKERS = ['なぜ:', '契約:'];

const SOURCE = /^src\/.*\.(rs|ts|svelte|css|mjs)$/;
const TEST = /(\.test\.|\.spec\.|\/tests?\/|\/tests?\.rs$|test_support|\/__snapshots__\/|\/test\/|\.d\.ts$)/;
const LEADER = /^(\/\/[/!]?|\/\*+!?|\*(?!\/)|<!--)\s?/;
// コメントではなく指示として働くもの
const DIRECTIVE = /^(\/\/\/?\s*<|\/\/\s*(eslint|@ts-|#|prettier|svelte-)|<!--\s*svelte-ignore|\/\*\s*eslint)/;

/** 対象のファイルか（アプリのソースで、テストでない）。 */
export const isChecked = (file) => SOURCE.test(file) && !TEST.test(file);

/** @param {string} line */
function commentBody(line) {
  const t = line.trim();
  if (!LEADER.test(t) || DIRECTIVE.test(t)) return null;
  return t.replace(LEADER, '').replace(/\s*(\*\/|-->)\s*$/, '');
}

/**
 * `git diff -U0` の出力から、印の無い新しいコメントの塊を探す。
 * 続く行（同じ塊の 2 行目以降）は見ない。
 * @param {string} diff
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function unmarkedComments(diff) {
  const found = [];
  let file = '';
  let next = 0;
  let inBlock = false;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '');
      inBlock = false;
    } else if (raw.startsWith('@@')) {
      next = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
      inBlock = false;
    } else if (raw.startsWith('+') && isChecked(file)) {
      const body = commentBody(raw.slice(1));
      if (body !== null && !inBlock && body !== '' && !MARKERS.some((m) => body.startsWith(m))) {
        found.push({ file, line: next, text: raw.slice(1).trim() });
      }
      inBlock = body !== null;
      next += 1;
    } else {
      inBlock = false;
    }
  }
  return found;
}

/** @param {ReturnType<typeof unmarkedComments>} found */
export function describeViolations(found) {
  if (found.length === 0) return [];
  return [
    'コメントを足すときは、先頭に「なぜ:」か「契約:」を付けてください。',
    '「何をするか」は名前・型・小さな関数で書きます。印を付けるのは、OS やライブラリの癖、値の単位や範囲、守らないと壊れる決まりだけです。',
    ...found.map((f) => `  ${f.file}:${String(f.line)}  ${f.text}`),
  ];
}
