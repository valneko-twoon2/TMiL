// docs/ の置き方とリンクを確かめる（純粋関数）。決まりは .claude/skills/docs/SKILL.md。
import { posix } from 'node:path';

/** 番号付きのファイル名（`01-overview.md` など）。 */
const NUMBERED = /^(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** docs/ の .md をフォルダーごとに分ける。置いてはいけない場所のものは問題として返す。 */
function groupByFolder(md) {
  const problems = [];
  /** @type {Map<string, string[]>} フォルダー → ファイル名 */
  const folders = new Map();
  for (const file of md) {
    const parts = file.split('/');
    if (parts.length === 2 && parts[1] !== 'README.md') {
      problems.push(`${file}: docs/ の直下には置かず、種類ごとのフォルダーに入れてください`);
    } else if (parts.length > 3) {
      problems.push(`${file}: フォルダーは 1 段だけにしてください`);
    } else if (parts.length === 3) {
      const [, folder = '', name = ''] = parts;
      folders.set(folder, [...(folders.get(folder) ?? []), name]);
    }
  }
  return { problems, folders };
}

/** 1 つのフォルダーの中の問題（番号・重なり・README の案内）。readme が null なら README が無い。 */
function folderProblems(folder, names, readme) {
  const problems = [];
  if (readme === null) {
    problems.push(`docs/${folder}/README.md がありません（フォルダーの説明とファイルの一覧を書く）`);
  }
  const seen = new Map();
  for (const name of names.filter((n) => n !== 'README.md')) {
    const m = NUMBERED.exec(name);
    if (!m) {
      problems.push(
        `docs/${folder}/${name}: 名前は「2 桁の番号-英小文字.md」にしてください（例: 01-overview.md）`,
      );
      continue;
    }
    const other = seen.get(m[1]);
    if (other) problems.push(`docs/${folder}: 番号 ${m[1]} が ${other} と ${name} で重なっています`);
    seen.set(m[1], name);
    if (readme !== null && !readme.includes(`(${name})`)) {
      problems.push(`docs/${folder}/README.md に ${name} の案内がありません`);
    }
  }
  return problems;
}

/**
 * docs/ のファイルの置き方の問題を返す。
 * - 直下に置いてよい .md は README.md だけ（ほかは種類ごとのフォルダーへ）
 * - フォルダーの .md は README.md と番号付きのファイルだけ。番号は重ならない
 * - 各フォルダーの README が、そのフォルダーのファイルをすべて案内している
 * - docs/README.md が、すべてのフォルダーを案内している
 * @param {string[]} files リポジトリ直下からの docs/ 以下の場所
 * @param {(path: string) => string} read 中身を読む
 * @returns {string[]}
 */
export function layoutProblems(files, read) {
  const md = files.filter((f) => f.startsWith('docs/') && f.endsWith('.md'));
  const { problems, folders } = groupByFolder(md);
  const top = md.includes('docs/README.md') ? read('docs/README.md') : null;
  if (top === null) problems.push('docs/README.md がありません');
  for (const [folder, names] of folders) {
    if (top !== null && !top.includes(`(${folder}/)`)) {
      problems.push(`docs/README.md に ${folder}/ の案内がありません`);
    }
    const readme = names.includes('README.md') ? read(`docs/${folder}/README.md`) : null;
    problems.push(...folderProblems(folder, names, readme));
  }
  return problems;
}

/**
 * Markdown の中の、リポジトリの中を指すリンクの行き先（リポジトリ直下からの場所）。
 * URL・ページ内リンク・コードの中の例は除く。
 * @param {string} file リンクを書いたファイル
 * @param {string} content その中身
 * @returns {{ link: string, target: string }[]}
 */
export function localLinks(file, content) {
  const dir = posix.dirname(file);
  const links = [];
  const text = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const raw = m[1] ?? '';
    const link = raw.split('#')[0] ?? '';
    if (link === '' || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    links.push({ link: raw, target: posix.normalize(posix.join(dir, decodeURI(link))).replace(/\/$/, '') });
  }
  return links;
}

/**
 * 行き先が無いリンク。
 * @param {string[]} files 確かめる Markdown
 * @param {(path: string) => string} read
 * @param {(path: string) => boolean} exists
 */
export function brokenLinks(files, read, exists) {
  return files.flatMap((file) =>
    localLinks(file, read(file))
      .filter((l) => !exists(l.target))
      .map((l) => `${file}: リンク先がありません: ${l.link}`),
  );
}
