import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    exclude: [
      'backend/test/**',
      'backend/tests/**',
      'tests/e2e/**',
    ],
    include: [
      'src/**/*.test.{js,jsx,ts,tsx}',
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
