import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          include: ['infra/**/*.test.ts', 'packages/**/*.test.ts'],
          name: 'backend',
        },
      },
      {
        extends: true,
        test: {
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.tsx'],
          name: 'web',
        },
      },
    ],
  },
});
