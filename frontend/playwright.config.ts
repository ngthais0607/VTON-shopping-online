import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL, headless: true },
  reporter: 'list',
});
