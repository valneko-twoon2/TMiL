// Lint の設定。src/frontend だけでなく scripts/ と tests/ の JS・TS も対象にする。
// パターンはリポジトリ直下を基準に書く（scripts/lint/lint.mjs がルートから -c 付きで呼ぶ）。
import { resolve } from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const ROOT = resolve(import.meta.dirname, '..', '..');

const configs = defineConfig(
  {
    ignores: [
      'src/frontend/dist/',
      'src/frontend/dist-mock/',
      '.claude/worktrees/',
      'src/frontend/.stryker-tmp/',
      'src/backend/',
      'coverage/',
      'reports/',
      'test-results/',
      'playwright-report/',
      'tests/fuzz/',
    ],
  },
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: 'error',
      curly: ['error', 'multi-line'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-param-reassign': 'error',
      'no-implicit-coercion': 'error',
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-shadow': 'error',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser, svelteConfig },
    },
    rules: {
      'svelte/block-lang': ['error', { script: 'ts', style: null }],
      'svelte/require-each-key': 'error',
      'svelte/no-at-html-tags': 'error',
      'svelte/button-has-type': 'error',
      'svelte/no-target-blank': 'error',
      'svelte/prefer-svelte-reactivity': 'error',
    },
  },
  {
    files: ['src/frontend/**/*.ts', 'src/frontend/**/*.svelte'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // JS（スクリプト・設定）は型情報を使うルールを外す
    files: ['**/*.js', '**/*.mjs'],
    extends: [ts.configs.disableTypeChecked],
  },
);

// エディターがこのフォルダーを基準に読み込んでも、パターンの意味が変わらないようにする
export default configs.map((config) => ({ basePath: ROOT, ...config }));
