import { defineConfig } from '@playwright/test';

const E2E_PORT = 3099;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node dist-server/index.js`,
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      DB_PATH: '/tmp/podreader-e2e-test.db',
      SESSION_SECRET: 'e2e-test-secret',
      RATE_LIMIT_DISABLED: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
