// Stryker（フロントのミューテーションテスト）の設定。手動で回す。
// 実行: node scripts/test/mutation.mjs --frontend
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/frontend/lib/**/*.ts',
    '!src/frontend/lib/**/*.test.ts',
    '!src/frontend/lib/**/*.svelte.ts',
    '!src/frontend/lib/mock/**',
  ],
  reporters: ['clear-text', 'html'],
  htmlReporter: { fileName: 'reports/mutation/frontend/index.html' },
  tempDirName: '.stryker-tmp',
  thresholds: { high: 80, low: 60, break: null },
};
