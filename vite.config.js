import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
});
