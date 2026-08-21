import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Never ship source maps containing secrets to a public deployment.
    sourcemap: false,
  },
  test: {
    environment: 'node',
    // `scripts/` holds the build-time security checks, which are plain ESM rather
    // than TypeScript so they can run without a build step. Their logic is worth
    // testing for the same reason any guard is: a check that cannot fail on the
    // thing it exists for is not protecting anything.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs'],
    reporters: ['default'],
  },
});
