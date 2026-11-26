// TLA+ の検査の一覧と TLC の起動引数（純粋関数）。

/** 通るべき検査。順番に回す（一致の確認が先）。 */
export function formalChecks() {
  return [
    { module: 'MachineConformance', config: 'MachineConformance.cfg', label: 'Rust と TLA+ の遷移の一致' },
    { module: 'Backend', config: 'Backend.cfg', label: '状態機械と環境の組み合わせ' },
  ];
}

/**
 * 直した不具合を戻した版。TLC が期待した約束違反を見つければ合格（検査が空振りしていない証拠）。
 * `expect` は Backend.tla の violation に入る名前。
 */
export function regressionChecks() {
  return [
    { config: 'regressions/overlapping-samples.cfg', expect: 'overlappingSamples' },
    { config: 'regressions/resampled-too-soon.cfg', expect: 'resampledTooSoon' },
    { config: 'regressions/sampled-while-hidden.cfg', expect: 'sampledWhileHiddenOrQuitting' },
    { config: 'regressions/false-replacement-success.cfg', expect: 'falseReplacementSuccess' },
    { config: 'regressions/killed-protected.cfg', expect: 'killedProtected' },
    { config: 'regressions/killed-reused-pid.cfg', expect: 'killedReplacedProcess' },
  ].map((c) => ({ ...c, module: 'Regressions', label: `不具合版で ${c.expect} を見つける` }));
}

/**
 * TLC の起動引数。
 * @param {string} jar tla2tools.jar の場所
 * @param {{ module: string, config: string }} check
 * @param {string} metaDir 作業用フォルダー（終わったら消す）
 */
export function tlcArgs(jar, check, metaDir) {
  return [
    '-XX:+UseParallelGC',
    '-cp',
    jar,
    'tlc2.TLC',
    '-config',
    check.config,
    '-workers',
    'auto',
    '-metadir',
    metaDir,
    '-cleanup',
    '-noGenerateSpecTE',
    check.module,
  ];
}

/**
 * 不具合版の検査結果を判定する。TLC が失敗し、期待した違反名が反例に出ていれば合格。
 * @param {number} status TLC の終了コード
 * @param {string} output TLC の出力
 * @param {string} expect 期待する違反名
 */
export function regressionDetected(status, output, expect) {
  return (
    status !== 0 &&
    output.includes('Invariant Safe is violated') &&
    output.includes(`violation = "${expect}"`)
  );
}

/**
 * .cfg から検査する性質の名前（INVARIANT(S) / PROPERTY(IES) の下）を取り出す。テスト件数の集計に使う。
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
