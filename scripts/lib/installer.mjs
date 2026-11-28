// インストール スクリプトが読む SHA256SUMS の形（純粋関数）。
// リリースの CI は `sha256sum` で作るので、同じ「ハッシュ・空白 2 つ・ファイル名」の形にする。

/**
 * @param {Record<string, string>} hashes ファイル名 → SHA-256（16 進の小文字）
 * @returns {string}
 */
export function sha256sums(hashes) {
  return Object.entries(hashes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hash]) => `${hash}  ${name}\n`)
    .join('');
}
