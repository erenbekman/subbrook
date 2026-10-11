import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
})
