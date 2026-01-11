import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Inject environment variables at build time
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
    'import.meta.env.VITE_AISHACRM_BACKEND_URL': JSON.stringify(process.env.VITE_AISHACRM_BACKEND_URL || ''),
    'import.meta.env.VITE_CURRENT_BRANCH': JSON.stringify(process.env.VITE_CURRENT_BRANCH || 'main'),
    // Build/version marker injected at build time; falls back through common CI vars then local override
    'import.meta.env.VITE_APP_BUILD_VERSION': JSON.stringify(
      process.env.APP_BUILD_VERSION ||
      process.env.GIT_TAG ||
      process.env.GITHUB_REF_NAME ||
      process.env.VITE_APP_BUILD_VERSION ||
      'dev-local'
    ),
  },
  server: {
    allowedHosts: true,
    proxy: {
      // Route frontend /api calls to the backend during dev to avoid CORS
      // Use VITE_DEV_BACKEND_HOST for Docker or default to localhost:3001
      '/api': {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || 'localhost:3001'}`,
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || 'localhost:3001'}`,
        changeOrigin: true,
        secure: false,
      },
      '/api-docs': {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || 'localhost:3001'}`,
        changeOrigin: true,
        secure: false,
      },
      '/api-docs.json': {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || 'localhost:3001'}`,
        changeOrigin: true,
        secure: false,
      },
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Polyfill Node.js events module for browser (required by opossum/CircuitBreaker)
      'events': 'events'
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  // Removed custom optimizeDeps esbuild loader forcing all .js to jsx to avoid
  // potential transform issues with certain deps (e.g., React internals).
  optimizeDeps: {},
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    // Increase warning limit slightly - 600KB is reasonable for SaaS with lazy loading
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/entry-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Split vendor libraries into separate chunks for better caching
        // IMPORTANT: Only split truly independent libraries to avoid circular dependency issues
        manualChunks: (id) => {
          // React core - rarely changes, cache long-term
          // Include scheduler as it's tightly coupled with react-dom
          if (id.includes('node_modules/react/') || 
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'react-core';
          }
          // React Router - separate chunk (independent)
          if (id.includes('node_modules/react-router')) {
            return 'react-router';
          }
          // Supabase client - independent networking library
          if (id.includes('node_modules/@supabase')) {
            return 'supabase';
          }
          // Date utilities - independent
          if (id.includes('node_modules/date-fns')) {
            return 'date-utils';
          }
          // Recharts - heavy charting library (~385KB), split for better caching
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          // Let Vite/Rollup handle all other chunking automatically
          // This avoids circular dependency issues with d3/radix
        }
      }
    }
  },
  // Enable compression hints for better gzip
  reportCompressedSize: true
}) 