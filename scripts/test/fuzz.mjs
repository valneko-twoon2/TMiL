#!/usr/bin/env node
// cargo-fuzz で各ターゲットを時間を区切って回す。nightly と cargo-fuzz が必要。
//   node scripts/test/fuzz.mjs              各ターゲット 30 秒
//   node scripts/test/fuzz.mjs --time 120   各ターゲット 120 秒
// 普段は Rust の単体テスト内の簡易ファジング（mod fuzz）が回るので、こちらは CI（Linux）で使う。
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FUZZ_TOOLCHAIN, fuzzArgs } from '../lib/fuzz.mjs';
import { ROOT, run } from '../lib/proc.mjs';

const args = process.argv.slice(2);
const timeIndex = args.indexOf('--time');
const seconds = timeIndex === -1 ? 30 : Number(args[timeIndex + 1] ?? 30);
const targets = readdirSync(join(ROOT, 'tests', 'fuzz', 'fuzz_targets'))
  .filter((f) => f.endsWith('.rs'))
  .map((f) => f.replace(/\.rs$/, ''));

let failed = false;
for (const target of targets) {
  console.log(`▶ ${target}（${String(seconds)} 秒）`);
  const r = run('cargo', fuzzArgs(target, seconds), { toolchain: FUZZ_TOOLCHAIN });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
