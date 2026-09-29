import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'msedge',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: process.env.PREVIEW_URL ? undefined : { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  reporter: 'list',
})
