import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://neomorrison.github.io/hustle-tycoon/ in production.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/hustle-tycoon/' : '/',
  plugins: [react()],
  server: { port: 5320 },
}))
