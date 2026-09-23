import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// Portable Vite config for continuing development outside Figma Make.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    // The standalone HTML must contain both offline inference assets.
    assetsInlineLimit: 20 * 1024 * 1024,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname ?? '.', './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8090,
  },
  preview: {
    host: '127.0.0.1',
    port: 8090,
  },
})
