import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  server: {
    allowedHosts: true,
    proxy: {
      // Route frontend /api calls to the backend during dev to avoid CORS
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api-docs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api-docs.json': {
        target: 'http://localhost:3001',
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
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      // Treat runtime env.js as external to avoid Vite/Rollup trying to resolve it at build time
      external: ['/env.js'],
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
        entryFileNames: 'assets/entry-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Manual chunking to reduce the 2.9MB bundle size
        manualChunks: (id) => {
          // Split large vendor libraries into separate chunks
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            // Radix UI components
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            // Supabase client
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            // Lucide icons
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // Date/time libraries
            if (id.includes('date-fns') || id.includes('dayjs')) {
              return 'vendor-date';
            }
            // Other vendors
            return 'vendor-other';
          }
          // Split app code by domain
          if (id.includes('/src/components/')) {
            if (id.includes('/ai/')) return 'app-ai';
            if (id.includes('/shared/')) return 'app-shared';
            return 'app-components';
          }
          if (id.includes('/src/pages/')) {
            return 'app-pages';
          }
          if (id.includes('/src/api/')) {
            return 'app-api';
          }
        }
      }
    }
  }
}) 