import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// ADR-011: unit and component tests run on the app's own Vite config (the @ds
// alias, the Preact preset, react → preact/compat), never a restated copy.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  }),
)
