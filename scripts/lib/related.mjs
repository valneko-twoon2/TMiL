// 変更したファイルから、回すべきテストを決める（純粋関数）。
import { normalizePath } from './files.mjs';

const CORE_SRC = 'src/backend/core/src/';

/**
 * Rust のファイルパスをテスト名の絞り込みに変える。
 * src/backend/core/src/startup/desktop.rs → "startup::desktop::"
 * lib.rs や mod.rs は配下すべて、Cargo.toml などは全体（空文字）。
 * @param {string} file
 * @returns {string | null} null は Rust のテスト対象外
 */
export function rustFilterFor(file) {
  const f = normalizePath(file);
  if (f.startsWith('src/backend/core/tests/')) return f.endsWith('contract.rs') ? 'contract::' : '';
  if (!f.startsWith(CORE_SRC)) {
    return /(^|\/)Cargo\.(toml|lock)$/.test(f) || f.startsWith('tests/contract/') ? '' : null;
  }
  const rel = f.slice(CORE_SRC.length).replace(/\.rs$/, '');
  if (rel === 'lib') return '';
  const parts = rel.split('/');
  if (parts.at(-1) === 'mod') parts.pop();
  return `${parts.join('::')}::`;
}

/**
 * 変更ファイルから実行計画を作る。
 * @param {string[]} files
 * @returns {{ frontend: string[], rustFilters: string[], contract: boolean, uiChanged: boolean, backendChanged: boolean }}
 */
export function planTests(files) {
  const normalized = files.map(normalizePath);
  const frontend = normalized.filter(
    (f) => /^(src\/frontend|scripts)\/.*\.(ts|mjs|svelte|js)$/.test(f) && !f.endsWith('.snap'),
  );
  const filters = new Set();
  for (const f of normalized) {
    const filter = rustFilterFor(f);
    if (filter !== null) filters.add(filter);
  }
  // 全体を回すなら個別の絞り込みは不要
  const rustFilters = filters.has('') ? [''] : [...filters].sort();
  const contract =
    normalized.some(
      (f) => f.startsWith('tests/contract/') || f.endsWith('/model.rs') || f.endsWith('/model/types.ts'),
    ) || normalized.some((f) => f.endsWith('/model/guards.ts'));
  const uiChanged = normalized.some((f) => /^src\/frontend\/.*\.(svelte|css)$/.test(f));
  const backendChanged = normalized.some((f) => f.startsWith('src/backend/'));
  return { frontend, rustFilters, contract, uiChanged, backendChanged };
}
