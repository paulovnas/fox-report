import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/client/**/*.test.ts', 'test/server/**/*.test.ts'],
    setupFiles: ['test/client/setup.ts'],
    restoreMocks: true,
  },
});
