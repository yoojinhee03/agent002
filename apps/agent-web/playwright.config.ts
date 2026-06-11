import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './scripts',
  testMatch: /capture-docs-screenshots\.ts$/,
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.DOCS_CAPTURE_BASE_URL ?? 'http://localhost:28002',
    viewport: { width: 1440, height: 900 },
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
})
