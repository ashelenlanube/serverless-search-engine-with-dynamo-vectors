import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import noComments from 'eslint-plugin-no-comments';
import betterMaxParams from 'eslint-plugin-better-max-params';

export default defineConfig(
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/cdk.out/**',
      '**/node_modules/**',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      'no-comments': noComments,
      'better-max-params': betterMaxParams,
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-comments/disallowComments': 'error',
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: ['const', 'let', 'var'],
          next: '*',
        },
        {
          blankLine: 'never',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
        {
          blankLine: 'always',
          prev: 'block-like',
          next: 'return',
        },
      ],
      'better-max-params/better-max-params': [
        'error',
        {
          constructor: 7,
          func: 2,
        },
      ],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true }],
      'no-magic-numbers': [
        'error',
        {
          detectObjects: false,
          enforceConst: true,
          ignore: [0, 1, -1, 2],
          ignoreArrayIndexes: true,
        },
      ],
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-statements': ['error', 20],
      'max-classes-per-file': ['error', 1],
      'no-console': 'error',
      'id-length': ['error', { min: 2 }],
      eqeqeq: ['error', 'always'],
    },
  },
);
