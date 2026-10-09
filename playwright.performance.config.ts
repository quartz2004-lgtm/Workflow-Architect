import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/performance', workers: 1, timeout: 60_000, outputDir: 'performance-results',
  use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
