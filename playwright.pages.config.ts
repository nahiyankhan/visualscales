import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src',
  testMatch: 'pages.spec.ts',
  outputDir: './test-results/pages',
  use: {
    baseURL: 'http://127.0.0.1:4186',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command:
      'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4186 --strictPort',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
