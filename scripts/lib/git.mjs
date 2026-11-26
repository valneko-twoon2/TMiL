// git の状態を調べる共通ヘルパー。
import { capture, run } from './proc.mjs';

function splitZ(out) {
  return out.split('\0').filter(Boolean);
}

/** ステージ済み（追加・変更・リネーム）のファイル一覧。 */
export function stagedFiles() {
  return splitZ(capture('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
}

/** HEAD からの未コミット変更（未追跡を含む）のファイル一覧。 */
export function changedFiles() {
  const tracked = splitZ(capture('git', ['diff', 'HEAD', '--name-only', '--diff-filter=ACMR', '-z']));
  const untracked = splitZ(capture('git', ['ls-files', '--others', '--exclude-standard', '-z']));
  return [...new Set([...tracked, ...untracked])];
}

/** 指定コミットから HEAD までに変更されたファイル一覧。 */
export function filesChangedSince(ref) {
  return splitZ(capture('git', ['diff', `${ref}...HEAD`, '--name-only', '--diff-filter=ACMR', '-z']));
}

/** 作業ツリーに未コミットの変更があるか。 */
export function isDirty() {
  return capture('git', ['status', '--porcelain']).trim().length > 0;
}

/** upstream に未 push のコミット数。upstream が無ければ null。 */
export function unpushedCount() {
  const hasUpstream = run('git', ['rev-parse', '--abbrev-ref', '@{u}'], { quiet: true });
  if (hasUpstream.status !== 0) return null;
  const out = capture('git', ['rev-list', '--count', '@{u}..HEAD']).trim();
  return out ? Number(out) : 0;
}

/** 現在のブランチ名。 */
export function currentBranch() {
  return capture('git', ['branch', '--show-current']).trim();
}

/**
 * インデックス上で CRLF を含むファイルを返す。
 * `git ls-files --eol` の i/crlf・i/mixed を見る。
 */
export function crlfInIndex(files) {
  if (files.length === 0) return [];
  const out = capture('git', ['ls-files', '--eol', '-z', '--', ...files]);
  return splitZ(out)
    .map((line) => {
      const [info, path] = line.split('\t');
      return { info, path };
    })
    .filter(({ info }) => /i\/(crlf|mixed)/.test(info))
    .map(({ path }) => path);
}
