import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@hpcc-js/wasm'],
  },
  plugins: [
    electron({
      main: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            emptyOutDir: false,
          },
        },
      },
      preload: {
        input: path.resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            emptyOutDir: false,
            rollupOptions: {
              output: {
                // Force .js extension so main.ts can reference 'preload.js'
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
    }),
  ],
});
