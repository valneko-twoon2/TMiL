#!/usr/bin/env node
// バージョンを上げる。src/frontend の package.json・package-lock.json、src/backend の Cargo.toml・Cargo.lock、
// CHANGELOG.md を更新する。tauri.conf.json は package.json のバージョンを参照しているので触らない。
//   node scripts/release/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNewer, isSemver, releaseUnreleased } from '../lib/changelog.mjs';
import { BACKEND, FRONTEND, ROOT, run } from '../lib/proc.mjs';

const version = process.argv[2] ?? '';
const pkgPath = join(FRONTEND, 'package.json');
const lockPath = join(FRONTEND, 'package-lock.json');
const cargoPath = join(BACKEND, 'Cargo.toml');
const changelogPath = join(ROOT, 'CHANGELOG.md');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

if (!isSemver(version)) {
  console.error('使い方: node scripts/release/bump-version.mjs <x.y.z>');
  process.exit(1);
}
const pkg = readJson(pkgPath);
if (!isNewer(version, pkg.version)) {
  console.error(`今のバージョン（${pkg.version}）より大きくしてください`);
  process.exit(1);
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const changelog = releaseUnreleased(readFileSync(changelogPath, 'utf8'), version, today);

pkg.version = version;
writeJson(pkgPath, pkg);

const lock = readJson(lockPath);
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeJson(lockPath, lock);

const cargo = readFileSync(cargoPath, 'utf8');
const nextCargo = cargo.replace(
  /(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/,
  (_, head, tail) => `${head}${version}${tail}`,
);
if (nextCargo === cargo) {
  console.error('src/backend/Cargo.toml の [workspace.package] version が見つかりません');
  process.exit(1);
}
writeFileSync(cargoPath, nextCargo);
writeFileSync(changelogPath, changelog);

const lockUpdate = run('cargo', ['update', '--workspace', '--offline'], { quiet: true, cwd: BACKEND });
if (lockUpdate.status !== 0) run('cargo', ['update', '--workspace'], { cwd: BACKEND });

console.log(`バージョンを ${version} にしました。差分を確認してコミットしてください。`);
