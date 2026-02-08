/// <reference types="node" />

import { defineConfig } from "vite";
import process from "process";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ""),
    "import.meta.env.VITE_AISHACRM_BACKEND_URL": JSON.stringify(process.env.VITE_AISHACRM_BACKEND_URL || ""),
    "import.meta.env.VITE_CURRENT_BRANCH": JSON.stringify(process.env.VITE_CURRENT_BRANCH || "main"),
    "import.meta.env.VITE_APP_BUILD_VERSION": JSON.stringify(
      process.env.APP_BUILD_VERSION ||
        process.env.GIT_TAG ||
        process.env.GITHUB_REF_NAME ||
        process.env.VITE_APP_BUILD_VERSION ||
        "dev-local"
    )
  },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || "localhost:3001"}`,
        changeOrigin: true,
        secure: false
      },
      "/health": {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || "localhost:3001"}`,
        changeOrigin: true,
        secure: false
      },
      "/api-docs": {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || "localhost:3001"}`,
        changeOrigin: true,
        secure: false
      },
      "/api-docs.json": {
        target: `http://${process.env.VITE_DEV_BACKEND_HOST || "localhost:3001"}`,
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "events": "events"
    },
    extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".json"]
  },
  optimizeDeps: {},
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/entry-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks: (id) => {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-core";
          }
          if (id.includes("node_modules/react-router")) return "react-router";
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/date-fns")) return "date-utils";
          if (id.includes("node_modules/recharts")) return "recharts";
        }
      }
    }
  },
  reportCompressedSize: true
});

