import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => ({
  // どこから起動しても、このフォルダー（src/frontend）を基準にする
  root: import.meta.dirname,
  publicDir: '../../assets',
  plugins: [svelte()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    ws: host ? { protocol: 'ws', host, port: 1421 } : undefined,
  },
  preview: { port: 4173, strictPort: true },
  build: {
    // モック版（E2E・VRT 用）は本番ビルドと出力先を分ける
    outDir: mode === 'mock' ? 'dist-mock' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
  },
}));
