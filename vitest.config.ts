import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          include: ['test/infra/**/*.test.ts', 'test/packages/**/*.test.ts'],
          name: 'backend',
        },
      },
      {
        esbuild: {
          jsx: 'automatic',
        },
        extends: true,
        test: {
          environment: 'jsdom',
          include: ['test/apps/web/**/*.test.tsx'],
          name: 'web',
        },
      },
    ],
  },
});
