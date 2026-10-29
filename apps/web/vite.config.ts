import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { dirname } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages: set VITE_BASE_PATH=/shul_CRM/ (trailing slash). Default `/` for Docker/same-origin.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  build: {
    // The framework chunk (React + MUI + React Router + React Query) is ~560 kB, ~170 kB gzipped;
    // splitting it further gives circular-chunk warnings (see below), so allow it.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        // Split vendor libs out of the entry chunk so per-route chunks stay
        // small. The React + MUI + Emotion + data-fetching stack is tightly
        // coupled (MUI→React/Emotion, pickers→dayjs, react-query→React), so
        // keep that whole stack in ONE chunk — splitting it produces circular
        // chunk warnings. Only the leaf libs (zod and other small utilities) go to a 2nd chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('react') ||
            id.includes('@mui') ||
            id.includes('@emotion') ||
            id.includes('@tanstack') ||
            id.includes('@hookform') ||
            id.includes('dayjs')
          ) {
            return 'framework';
          }
          return 'vendor';
        },
      },
    },
  },
  // changeOrigin stays false so the API sees the browser's own host (localhost:5173) and the
  // invitation links it builds point at the app, not at the API's port.
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
