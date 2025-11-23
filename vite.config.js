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
  },
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
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/entry-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // CRITICAL FIX: Ensure ALL React-related packages go in the same chunk
          // This includes react-router-dom v7 which uses @remix-run/router internally
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('react-router') ||
            id.includes('@remix-run/router') ||
            id.includes('scheduler')
          ) return 'vendor-react';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
          // Don't manually chunk recharts - let Vite handle it to avoid circular dependency issues
          // if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) return 'vendor-forms';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (/date-fns|clsx|tailwind-merge|tailwindcss-animate/.test(id)) return 'vendor-utils';
        }
      }
    }
  }
}) 