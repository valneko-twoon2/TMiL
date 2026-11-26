// テスト一覧の分類と Markdown 化（純粋関数）。

/**
 * @typedef {{ runner: 'vitest' | 'cargo' | 'cargo-fuzz' | 'playwright' | 'node-test' | 'tlc', file: string, path: string[], project?: string }} TestCase
 */

/** 種類（表示順）。 */
export const KINDS = [
  ['equivalence', '単体（同値分割）'],
  ['boundary', '単体（境界値）'],
  ['regression', '単体（回帰）'],
  ['unit', '単体（その他）'],
  ['snapshot', 'スナップショット'],
  ['contract', '契約'],
  ['fuzz', 'ファジング'],
  ['formal', '形式検証'],
  ['vrt', 'VRT'],
  ['e2e-mock', 'E2E（モック）'],
  ['e2e-native', 'E2E（実アプリ）'],
];

/** 対象（表示順）。 */
export const LAYERS = [
  ['frontend', 'フロント'],
  ['backend', 'バック'],
  ['tooling', 'ツール'],
  ['app', 'アプリ全体'],
];

const TAGS = new Set(['equivalence', 'boundary', 'regression', 'snapshot', 'contract', 'fuzz', 'formal']);

/**
 * テスト 1 件の種類を決める。名前の途中にあるタグを優先し、無ければ実行方法から決める。
 * @param {TestCase} c
 */
export function kindOf(c) {
  if (c.runner === 'playwright') return c.project === 'vrt' ? 'vrt' : 'e2e-mock';
  // node:test は scripts/ のテストと実アプリの E2E の両方で使っている
  if (c.runner === 'node-test' && !isTooling(c)) return 'e2e-native';
  if (c.runner === 'cargo-fuzz') return 'fuzz';
  if (c.runner === 'tlc') return 'formal';
  return c.path.find((segment) => TAGS.has(segment)) ?? 'unit';
}

/** @param {TestCase} c */
const isTooling = (c) => c.file.startsWith('scripts/');

/**
 * テスト 1 件の対象を決める。
 * @param {TestCase} c
 */
export function layerOf(c) {
  if (c.runner === 'cargo' || c.runner === 'cargo-fuzz' || c.runner === 'tlc') return 'backend';
  if (isTooling(c)) return 'tooling';
  if (c.runner === 'node-test') return 'app';
  return 'frontend';
}

const XML_ENTITIES = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const unescapeXml = (s) => s.replace(/&(quot|apos|lt|gt|amp);/g, (e) => XML_ENTITIES[e] ?? e);

/**
 * node --test の JUnit 形式の出力から、テスト 1 件ごとのファイルと名前（describe の入れ子）を取り出す。
 * @param {string} xml
 * @returns {{ file: string, path: string[] }[]}
 */
export function parseJunit(xml) {
  /** @type {{ file: string, path: string[] }[]} */
  const cases = [];
  /** @type {string[]} */
  const suites = [];
  const tags = /<testsuite name="([^"]*)"[^>]*>|<\/testsuite>|<testcase name="([^"]*)"[^>]*?file="([^"]*)"/g;
  for (const m of xml.matchAll(tags)) {
    if (m[0] === '</testsuite>') suites.pop();
    else if (m[1] !== undefined) suites.push(unescapeXml(m[1]));
    else cases.push({ file: unescapeXml(m[3] ?? ''), path: [...suites, unescapeXml(m[2] ?? '')] });
  }
  return cases;
}

/**
 * @param {TestCase[]} cases
 */
export function buildInventory(cases) {
  /** @type {Map<string, number>} 種類|対象 → 件数 */
  const matrix = new Map();
  /** @type {Map<string, { layer: string, kinds: Map<string, number> }>} ファイル → 内訳 */
  const files = new Map();
  for (const c of cases) {
    const kind = kindOf(c);
    const layer = layerOf(c);
    const key = `${kind}|${layer}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);
    const entry = files.get(c.file) ?? { layer, kinds: new Map() };
    entry.kinds.set(kind, (entry.kinds.get(kind) ?? 0) + 1);
    files.set(c.file, entry);
  }
  return { matrix, files, total: cases.length };
}

/**
 * @param {ReturnType<typeof buildInventory>} inv
 */
export function renderInventory(inv) {
  const lines = [
    '# テスト一覧',
    '',
    '> 自動生成です。手で編集せず `npm run docs:tests` で更新してください。',
    '> 種類の決め方は [tags.md](tags.md) を参照。',
    '',
    `合計 **${String(inv.total)}** 件`,
    '',
    '## 種類 × 対象',
    '',
    `| 種類 | ${LAYERS.map(([, l]) => l).join(' | ')} | 合計 |`,
    `| --- | ${LAYERS.map(() => '---:').join(' | ')} | ---: |`,
  ];
  const colTotals = LAYERS.map(() => 0);
  for (const [kind, kindLabel] of KINDS) {
    const counts = LAYERS.map(([layer]) => inv.matrix.get(`${kind}|${layer}`) ?? 0);
    const sum = counts.reduce((a, b) => a + b, 0);
    counts.forEach((n, i) => (colTotals[i] = (colTotals[i] ?? 0) + n));
    lines.push(`| ${kindLabel} | ${counts.map(String).join(' | ')} | ${String(sum)} |`);
  }
  lines.push(
    `| **合計** | ${colTotals.map((n) => `**${String(n)}**`).join(' | ')} | **${String(inv.total)}** |`,
  );

  for (const [layer, layerLabel] of LAYERS) {
    const rows = [...inv.files.entries()]
      .filter(([, v]) => v.layer === layer)
      .sort(([a], [b]) => a.localeCompare(b));
    if (rows.length === 0) continue;
    lines.push(
      '',
      `## ${layerLabel}の内訳`,
      '',
      '| ファイル / モジュール | 件数 | 内訳 |',
      '| --- | ---: | --- |',
    );
    for (const [file, v] of rows) {
      const total = [...v.kinds.values()].reduce((a, b) => a + b, 0);
      const detail = KINDS.filter(([k]) => v.kinds.has(k))
        .map(([k, l]) => `${l} ${String(v.kinds.get(k))}`)
        .join(' / ');
      lines.push(`| \`${file}\` | ${String(total)} | ${detail} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}
