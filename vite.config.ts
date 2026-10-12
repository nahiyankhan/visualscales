import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Three product experiences plus the old split URL's redirect document.
// Dev and the static build share routes, with no SPA fallback or study builds.
export default defineConfig({
  appType: 'mpa',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        globe: fileURLToPath(new URL('./globe.html', import.meta.url)),
        space: fileURLToPath(new URL('./space.html', import.meta.url)),
        splitRedirect: fileURLToPath(new URL('./split.html', import.meta.url)),
      },
    },
  },
})
