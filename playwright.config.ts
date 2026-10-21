import { defineConfig, devices } from '@playwright/test'

// ADR-011: journeys run against a production build in the single-origin deploy
// shape (ADR-005: relative /bar and /search, as `pnpm build:deploy` builds it),
// served by vite preview. Every /bar/ and /search/ request is answered by the
// fixtures in e2e/support; nothing reaches a live stack.
const port = Number(process.env['E2E_PORT'] ?? 4319)
const baseURL = `http://127.0.0.1:${port}`
const outDir = 'node_modules/.e2e-dist'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    // The shell-cache worker would sit between the page and the route fakes;
    // a spec about the worker opts back in.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    // The design system's reference phone width (390px), touch and mobile UA.
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      `vite build --outDir ${outDir} --emptyOutDir && ` +
      `vite preview --outDir ${outDir} --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_API_URL: '/bar', VITE_MEILISEARCH_URL: '/search' },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
