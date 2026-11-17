import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function copyPublicIndexPlugin() {
  return {
    name: 'copy-public-index',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.copyFileSync(
        path.resolve(__dirname, 'index.html'),
        path.join(distDir, 'index.html')
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyPublicIndexPlugin()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
});
