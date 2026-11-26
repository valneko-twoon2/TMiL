import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// テストは tests/ にある。パッケージの場所は tests/tsconfig.json の paths で教えている
export default defineConfig({
  outputDir: '../../test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
    viewport: { width: 1040, height: 720 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  projects: [
    { name: 'e2e-mock', testDir: '../../tests/e2e/mock' },
    { name: 'vrt', testDir: '../../tests/vrt' },
  ],
  webServer: {
    command: 'npm run build:mock && npx vite preview --mode mock --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
