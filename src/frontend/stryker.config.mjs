// Stryker（フロントのミューテーションテスト）の設定。手動で回す。
// 実行: node scripts/test/mutation.mjs --frontend
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: ['lib/**/*.ts', '!lib/**/*.test.ts', '!lib/**/*.svelte.ts', '!lib/mock/**'],
  // テストが src/frontend の外（tests/contract/fixtures）を読むので、コピーを作らずその場で変異させる。
  // 終わると元に戻る
  inPlace: true,
  reporters: ['clear-text', 'html'],
  htmlReporter: { fileName: '../../reports/mutation/frontend/index.html' },
  thresholds: { high: 80, low: 60, break: null },
};
