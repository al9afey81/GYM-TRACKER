const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  webServer: { command: 'python3 -m http.server 4185 --bind 127.0.0.1', url: 'http://127.0.0.1:4185' },
  use: { baseURL: 'http://127.0.0.1:4185' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.GYM_CHROMIUM_PATH ? { executablePath: process.env.GYM_CHROMIUM_PATH } : {} } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions: process.env.GYM_CHROMIUM_PATH ? { executablePath: process.env.GYM_CHROMIUM_PATH } : {} } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
});
