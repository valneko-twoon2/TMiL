#!/usr/bin/env node
// テストを並列でまとめて回す（ミューテーションは除く）。
//   node scripts/test/all.mjs                  単体・スナップショット・契約・ファジング(簡易)・E2E(モック)・VRT
//   node scripts/test/all.mjs --e2e-native     実アプリの E2E も回す
//   node scripts/test/all.mjs --fuzz           cargo-fuzz も回す（nightly が必要）
// VRT の基準画像は Linux（CI）のものなので、Windows では VRT を飛ばす。
import { spawn } from 'node:child_process';
import { FRONTEND, ROOT, nodeBin, toolEnv } from '../lib/proc.mjs';
import { toolTestArgs } from '../lib/tools.mjs';

const args = process.argv.slice(2);
const node = process.execPath;

/** @type {{ name: string, cmd: string, args: string[], cwd?: string }[]} */
const jobs = [
  {
    name: 'フロント（単体・スナップショット・契約・ファジング）',
    cmd: node,
    args: [nodeBin('vitest', 'vitest'), 'run', '--coverage'],
    cwd: FRONTEND,
  },
  {
    name: 'バック（単体・スナップショット・契約・ファジング）',
    cmd: node,
    args: ['scripts/test/backend.mjs', '--coverage'],
  },
  { name: 'ツール', cmd: node, args: toolTestArgs() },
  {
    name: 'E2E（モック）',
    cmd: node,
    args: [nodeBin('@playwright/test', 'playwright'), 'test', '--project=e2e-mock'],
    cwd: FRONTEND,
  },
];
if (process.platform === 'linux') {
  jobs.push({
    name: 'VRT',
    cmd: node,
    args: [nodeBin('@playwright/test', 'playwright'), 'test', '--project=vrt'],
    cwd: FRONTEND,
  });
}
if (args.includes('--e2e-native')) {
  jobs.push({ name: 'E2E（実アプリ）', cmd: node, args: ['scripts/test/e2e-native.mjs'] });
}
if (args.includes('--fuzz')) {
  jobs.push({ name: 'ファジング（cargo-fuzz）', cmd: node, args: ['scripts/test/fuzz.mjs'] });
}

function runJob(job) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(job.cmd, job.args, {
      cwd: job.cwd ?? ROOT,
      env: toolEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => (output += String(d)));
    child.stderr.on('data', (d) => (output += String(d)));
    child.on('close', (code) => {
      resolve({ job, code: code ?? 1, output, sec: ((Date.now() - started) / 1000).toFixed(1) });
    });
  });
}

const results = await Promise.all(jobs.map(runJob));
let failed = false;
for (const r of results) {
  console.log(`${r.code === 0 ? '✔' : '✖'} ${r.job.name} (${r.sec}s)`);
  if (r.code !== 0) {
    failed = true;
    console.log(r.output.split('\n').slice(-40).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
