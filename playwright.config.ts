import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests', fullyParallel: false,
  testIgnore: ['**/performance/**', '**/desktop/**'],
  use: { baseURL: 'http://127.0.0.1:4174', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
})
