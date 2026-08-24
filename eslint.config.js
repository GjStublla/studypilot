import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const sourceFiles = ['src/**/*.{ts,tsx}', 'scripts/**/*.{js,mjs}', 'e2e/**/*.ts', '*.config.{js,mjs,ts}'];

const nodeFiles = ['scripts/**/*.{js,mjs}', 'e2e/**/*.ts', '*.config.{js,mjs,ts}'];

export default [
  {
    ignores: [
      'dist/**',
      'extension/**',
      'node_modules/**',
      'output/**',
      'coverage/**',
      'test-results/**',
      'tmp/**',
      'backend/**',
      'supabase/**',
    ],
  },
  { files: sourceFiles, ...js.configs.recommended },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: sourceFiles,
  })),
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: sourceFiles,
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
