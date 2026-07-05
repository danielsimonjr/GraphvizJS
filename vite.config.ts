import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
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
            rollupOptions: {
              // The main process now imports the headless render/export core, which
              // pulls native (.node) and heavy Node modules. These must NOT be bundled
              // by rollup (it can't parse `canvas.node`); they load from node_modules at
              // runtime and are bundled into the installer by electron-builder.
              external: [
                '@hpcc-js/wasm',
                '@resvg/resvg-js',
                'canvas',
                'jsdom',
                'jspdf',
                'svg2pdf.js',
              ],
            },
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
