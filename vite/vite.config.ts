import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// The PHP theme injects assets from build.manifest, so the entry must stay at
// src/main.tsx to match app/config/app.php -> vite.entry.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    origin: 'http://localhost:5173',
  },
  build: {
    outDir: '../assets/dist',
    assetsDir: '',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      input: 'src/main.tsx',
    },
  },
});
