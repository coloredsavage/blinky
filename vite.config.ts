import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    process: 'process',
  },
  optimizeDeps: {
    include: ['simple-peer']
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
    }
  }
})