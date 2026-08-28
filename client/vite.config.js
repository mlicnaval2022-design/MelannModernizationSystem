import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Reports and PDF tooling are already route/lazy-loaded and do not inflate
    // the initial application bundle. Keep a deliberate ceiling for those
    // on-demand chunks instead of Vite's generic 500 kB threshold.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    pool: 'vmThreads',
    maxWorkers: 1,
    fileParallelism: false,
  },
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': 'http://127.0.0.1:5001',
      '/uploads': 'http://127.0.0.1:5001',
    },
  },
})
