import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify('0.0.0-test') },
  test: {
    include: ['src/frontend/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/frontend/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.svelte.ts', 'src/frontend/lib/mock/**', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage/frontend',
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
