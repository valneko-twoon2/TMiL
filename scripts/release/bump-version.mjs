#!/usr/bin/env node
// バージョンを上げる。package.json・package-lock.json・Cargo.toml・Cargo.lock・CHANGELOG.md を更新する。
// tauri.conf.json は package.json のバージョンを参照しているので触らない。
//   node scripts/release/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNewer, isSemver, releaseUnreleased } from '../lib/changelog.mjs';
import { ROOT, run } from '../lib/proc.mjs';

const version = process.argv[2] ?? '';
const path = (name) => join(ROOT, name);
const readJson = (name) => JSON.parse(readFileSync(path(name), 'utf8'));
const writeJson = (name, data) => writeFileSync(path(name), `${JSON.stringify(data, null, 2)}\n`);

if (!isSemver(version)) {
  console.error('使い方: node scripts/release/bump-version.mjs <x.y.z>');
  process.exit(1);
}
const pkg = readJson('package.json');
if (!isNewer(version, pkg.version)) {
  console.error(`今のバージョン（${pkg.version}）より大きくしてください`);
  process.exit(1);
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const changelog = releaseUnreleased(readFileSync(path('CHANGELOG.md'), 'utf8'), version, today);

pkg.version = version;
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeJson('package-lock.json', lock);

const cargo = readFileSync(path('Cargo.toml'), 'utf8');
const nextCargo = cargo.replace(
  /(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/,
  (_, head, tail) => `${head}${version}${tail}`,
);
if (nextCargo === cargo) {
  console.error('Cargo.toml の [workspace.package] version が見つかりません');
  process.exit(1);
}
writeFileSync(path('Cargo.toml'), nextCargo);
writeFileSync(path('CHANGELOG.md'), changelog);

const lockUpdate = run('cargo', ['update', '--workspace', '--offline'], { quiet: true });
if (lockUpdate.status !== 0) run('cargo', ['update', '--workspace']);

console.log(`バージョンを ${version} にしました。差分を確認してコミットしてください。`);
