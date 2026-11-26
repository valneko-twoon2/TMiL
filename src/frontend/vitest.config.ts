import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify('0.0.0-test') },
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.svelte.ts', 'lib/mock/**', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      // 結果はリポジトリ直下の coverage/ にまとめる（バックと並べる）
      reportsDirectory: '../../coverage/frontend',
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
