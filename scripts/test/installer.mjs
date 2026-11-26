#!/usr/bin/env node
// インストール スクリプト（src/installer）を、偽のリリースを配る手元のサーバーで確かめる。
//   node scripts/test/installer.mjs
// - install.sh: Linux で、入れる・ハッシュ違いで止まる・消す を確かめる
// - install.ps1: Windows PowerShell（Windows）か pwsh で、irm | iex で読み込んで確かめるだけ（実際には入れない）
// 動かせるシェルが無い組み合わせは飛ばす。
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256sums } from '../lib/installer.mjs';
import { ROOT } from '../lib/proc.mjs';

const INSTALLER = join(ROOT, 'src', 'installer');
const work = mkdtempSync(join(tmpdir(), 'tmil-installer-'));
const failures = [];

/** 偽のリリースを作る。`bad` は SHA256SUMS のハッシュをわざと違える。 */
function makeRelease(dir, bad) {
  mkdirSync(dir, { recursive: true });
  const files = {
    'TMiL_9.9.9_amd64.AppImage': '#!/bin/sh\necho tmil\n',
    'TMiL_9.9.9_amd64.deb': 'deb',
    'TMiL_9.9.9_x64-setup.exe': 'setup',
    'install.sh': readFileSync(join(INSTALLER, 'install.sh')),
    'install.ps1': readFileSync(join(INSTALLER, 'install.ps1')),
  };
  const hashes = {};
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
    hashes[name] = createHash('sha256').update(body).digest('hex');
  }
  if (bad) {
    for (const name of Object.keys(hashes)) if (!name.startsWith('install.')) hashes[name] = '0'.repeat(64);
  }
  writeFileSync(join(dir, 'SHA256SUMS'), sha256sums(hashes));
}

makeRelease(join(work, 'good'), false);
makeRelease(join(work, 'bad'), true);

// GitHub と同じく、文字コードを付けずに octet-stream で配る
const server = createServer((req, res) => {
  const path = join(work, decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
  if (!path.startsWith(work) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    resolve(undefined);
  });
});
const address = server.address();
const base = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;

/** サーバーと同じプロセスで待つので、spawnSync ではなく spawn で動かす。 */
function exec(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => (output += String(d)));
    child.stderr.on('data', (d) => (output += String(d)));
    child.on('error', (e) => {
      resolve({ code: 1, output: String(e) });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function check(name, ok, detail) {
  console.log(`${ok ? '✔' : '✖'} ${name}`);
  if (!ok) {
    failures.push(name);
    console.log(detail);
  }
}

const has = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

try {
  if (process.platform === 'linux' && has('sh', ['-c', 'true'])) {
    const home = join(work, 'home');
    const env = (release) => ({
      TMIL_DOWNLOAD_BASE: `${base}/${release}`,
      TMIL_BIN_DIR: join(home, 'bin'),
      XDG_DATA_HOME: join(home, 'share'),
    });
    const script = join(INSTALLER, 'install.sh');
    const bin = join(home, 'bin', 'tmil');
    const desktop = join(home, 'share', 'applications', 'tmil.desktop');

    const bad = await exec('sh', [script], env('bad'));
    check('install.sh: ハッシュが違えば入れない', bad.code !== 0 && !existsSync(bin), bad.output);

    const good = await exec('sh', [script], env('good'));
    const executable = existsSync(bin) && (statSync(bin).mode & 0o111) !== 0;
    const entry = existsSync(desktop) ? readFileSync(desktop, 'utf8') : '';
    check(
      'install.sh: AppImage を入れてメニューに登録する',
      good.code === 0 && executable && entry.includes(`Exec=${bin}`),
      good.output,
    );

    const removed = await exec('sh', [script, '--uninstall'], env('good'));
    check(
      'install.sh: --uninstall で消す',
      removed.code === 0 && !existsSync(bin) && !existsSync(desktop),
      removed.output,
    );
  } else {
    console.log('- install.sh は Linux で確かめる（ここでは飛ばす）');
  }

  const ps = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  if (has(ps, ['-NoProfile', '-Command', 'exit 0'])) {
    // 利用者と同じく irm | iex で読み込む（文字コードの扱いもここで確かめる）。
    // Windows PowerShell はエラーが出ても続けて終了コード 0 で終わりうるので、エラーで止まるようにする
    const run = (release) =>
      exec(
        ps,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; irm '${base}/${release}/install.ps1' | iex`,
        ],
        { TMIL_DOWNLOAD_BASE: `${base}/${release}`, TMIL_DRY_RUN: '1' },
      );

    const good = await run('good');
    check(
      `install.ps1（${ps}）: 日本語のまま読み込み、ハッシュを確かめる`,
      good.code === 0 && good.output.includes('ハッシュを確かめました'),
      good.output,
    );

    const bad = await run('bad');
    check(
      `install.ps1（${ps}）: ハッシュが違えば止まる`,
      bad.code !== 0 && bad.output.includes('ハッシュが一致しません'),
      bad.output,
    );
  } else {
    console.log(`- install.ps1 は ${ps} が無いので飛ばす`);
  }
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n失敗: ${failures.join(', ')}`);
  process.exit(1);
}
