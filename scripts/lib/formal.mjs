// TLA+ の検査の一覧と TLC の起動引数（純粋関数）。

/** 検査する仕様。順番に回す（一致の確認が先）。 */
export function formalChecks() {
  return [
    { module: 'MachineConformance', label: 'Rust と TLA+ の遷移の一致' },
    { module: 'Backend', label: '状態機械と環境の組み合わせ' },
  ];
}

/**
 * TLC の起動引数。
 * @param {string} jar tla2tools.jar の場所
 * @param {{ module: string }} check
 * @param {string} metaDir 作業用フォルダー（終わったら消す）
 */
export function tlcArgs(jar, check, metaDir) {
  return [
    '-XX:+UseParallelGC',
    '-cp',
    jar,
    'tlc2.TLC',
    '-config',
    `${check.module}.cfg`,
    '-workers',
    'auto',
    '-metadir',
    metaDir,
    '-cleanup',
    check.module,
  ];
}

/**
 * .cfg から検査する性質の名前（INVARIANTS / PROPERTIES の下）を取り出す。テスト件数の集計に使う。
 * @param {string} cfg
 * @returns {string[]}
 */
export function propertiesInCfg(cfg) {
  const names = [];
  let inSection = false;
  for (const raw of cfg.split('\n')) {
    const line = raw.replace(/\\\*.*$/, '').trim();
    if (line === '') continue;
    if (/^[A-Z_]+$/.test(line) || /^[A-Z_]+\s/.test(line)) {
      inSection = /^(INVARIANTS?|PROPERTIES|PROPERTY)$/.test(line);
      continue;
    }
    if (inSection) names.push(...line.split(/\s+/));
  }
  return names;
}
