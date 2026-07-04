import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    setupFiles: ['test/setup.ts'],
    // CodeMirror + happy-dom setup (e.g. toolbar/actions) is heavy; under full
    // parallel load the default 5s can be starved into false timeouts. 15s keeps
    // the suite deterministic regardless of worker contention.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/vite-env.d.ts', 'src/main.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    globals: true,
  },
});
