#!/usr/bin/env node
// TLA+ の形式検証（TLC）を回す。Java 11 以上と tla2tools.jar が必要。
//   TLA2TOOLS=/path/to/tla2tools.jar node scripts/test/formal.mjs
// 1. MachineConformance: Rust の状態機械と TLA+ の Step が全遷移で一致するか
// 2. Backend: 環境と組み合わせて、約束（不変条件）と「いつかは終わる」（活性）を満たすか
// 3. Regressions: 直した不具合を戻した版で、TLC が必ず違反を見つけるか（検査の空振り防止）
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formalChecks, regressionChecks, regressionDetected, tlcArgs } from '../lib/formal.mjs';
import { ROOT, run } from '../lib/proc.mjs';

const jar = process.env.TLA2TOOLS;
if (!jar || !existsSync(jar)) {
  console.error(
    'TLA2TOOLS に tla2tools.jar の場所を指定してください（https://github.com/tlaplus/tlaplus/releases）。',
  );
  process.exit(1);
}

const dir = join(ROOT, 'tests', 'formal');

function tlc(check, quiet) {
  const meta = mkdtempSync(join(tmpdir(), 'taskmanagerlite-tlc-'));
  try {
    return run('java', tlcArgs(jar, check, meta), { cwd: dir, quiet });
  } finally {
    rmSync(meta, { recursive: true, force: true });
  }
}

let failed = false;
for (const check of formalChecks()) {
  console.log(`▶ ${check.label}（${check.module}.tla）`);
  if (tlc(check, false).status !== 0) failed = true;
}
for (const check of regressionChecks()) {
  const r = tlc(check, true);
  const ok = regressionDetected(r.status, r.stdout + r.stderr, check.expect);
  console.log(`${ok ? '✔' : '✖'} ${check.label}（${check.config}）`);
  if (!ok) {
    failed = true;
    console.log(r.stdout.split('\n').slice(-40).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
