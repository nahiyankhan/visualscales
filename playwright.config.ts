import { defineConfig } from '@playwright/test'

// Detailed renderer/interaction tests use Vite's source modules. Production
// routes have a separate build-and-preview suite in playwright.pages.config.ts.
export default defineConfig({
  testDir: './src',
  outputDir: './test-results/visual',
  workers: 2,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4187',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    {
      name: 'split-desktop',
      testMatch: 'split/split.spec.ts',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'split-mobile',
      testMatch: 'split/split.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'color',
      testMatch: 'globe/*.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'space-desktop',
      testMatch: 'space/*.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'space-laptop',
      testMatch: 'space/*.spec.ts',
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'space-mobile',
      testMatch: 'space/*.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
})
