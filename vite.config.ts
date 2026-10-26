import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves the app from /masroof/; dev serves from /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/masroof/' : '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
