#!/usr/bin/env node
// TLA+ の形式検証（TLC）を回す。Java 11 以上と tla2tools.jar が必要。
//   TLA2TOOLS=/path/to/tla2tools.jar node scripts/test/formal.mjs
// 1. MachineConformance: Rust の状態機械と TLA+ の Step が全遷移で一致するか
// 2. Backend: 環境と組み合わせて、約束（不変条件）と「いつかは終わる」（活性）を満たすか
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formalChecks, tlcArgs } from '../lib/formal.mjs';
import { ROOT, run } from '../lib/proc.mjs';

const jar = process.env.TLA2TOOLS;
if (!jar || !existsSync(jar)) {
  console.error(
    'TLA2TOOLS に tla2tools.jar の場所を指定してください（https://github.com/tlaplus/tlaplus/releases）。',
  );
  process.exit(1);
}

const dir = join(ROOT, 'tests', 'formal');
let failed = false;
for (const check of formalChecks()) {
  const meta = mkdtempSync(join(tmpdir(), 'tmil-tlc-'));
  console.log(`▶ ${check.label}（${check.module}.tla）`);
  try {
    const status = run('java', tlcArgs(jar, check, meta), { cwd: dir }).status;
    if (status !== 0) failed = true;
  } finally {
    rmSync(meta, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
