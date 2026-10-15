import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { dirname } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor libs out of the entry chunk so per-route chunks stay
        // small. The React + MUI + Emotion + data-fetching stack is tightly
        // coupled (MUI→React/Emotion, pickers→dayjs, react-query→React), so
        // keep that whole stack in ONE chunk — splitting it produces circular
        // chunk warnings. Only the leaf libs (zod, Hebcal) go to a 2nd chunk.
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
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
