import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@ds': fileURLToPath(
        new URL('./The Back Bar Design System/components', import.meta.url),
      ),
    },
  },
})
