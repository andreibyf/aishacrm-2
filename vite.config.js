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
    },
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  // Removed custom optimizeDeps esbuild loader forcing all .js to jsx to avoid
  // potential transform issues with certain deps (e.g., React internals).
  optimizeDeps: {},
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/entry-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Removed manualChunks to allow Vite's default strategy and avoid premature execution ordering issues.
      }
    }
  }
}) 