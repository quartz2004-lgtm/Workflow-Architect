/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/performance', workers: 1, timeout: 60_000, outputDir: 'performance-results',
  use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
