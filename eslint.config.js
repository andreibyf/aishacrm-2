import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist',
      '**/dist/**',
      'braid-mcp-node-server/dist/**',
      'n8n-nodes-mcp/**',
      'logseq/**',
      'scripts/**',
      'backend/node_modules/**',
      'src/functions/**',
      'src/functions.archived/**',
      'supabase/functions/**',
      'node_modules/**',
      '.DS_Store',
      '*.local',
      '.env.*',
      '*.env',
      'logseq/bak/**',
      'playwright-report/**',
      'test-results/**',
      'playwright/.cache/**',
      'orchestra/**',
      'archive/**',
      'backend/archive/**',
      // Addons have their own Docker context and linting
      'addons/**',
      // Claude Code worktrees (auto-generated, mirrors main repo)
      '.claude/**',
      // Continue.dev reranker venv (vendored Python packages)
      '.continue/**',
      // Migration and utility scripts (one-off scripts, not production code)
      'backend/migrations/**',
      'backend/apply-*.js',
      'backend/check-*.js',
      'backend/audit-*.js',
      'backend/backfill-*.js',
      'backend/bulk-*.js',
      'backend/clear-*.js',
      'backend/debug-*.js',
      'backend/list-*.js',
      'backend/test-*.js',
      'backend/add-*.js',
      'check-*.js',
      'debug-*.js',
      'list-*.js',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off', // Disabled - using modern React patterns instead of legacy PropTypes
      // Allow underscore-prefixed unused vars and ignore unused React import in JSX runtime projects
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(?:React|_)' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Lower-volume policy: many components include unescaped characters in
      // long docs/strings and several case-declaration patterns trip the linter
      // as errors. Treat these as warnings for now so CI/dev workflow isn't
      // blocked; we'll fix occurrences incrementally.
      'react/no-unescaped-entities': 'warn',
      'no-case-declarations': 'warn',
    },
  },
  // Backend (Node.js) override: allow Node globals like `process`, disable React rules
  {
    files: [
      'backend/**/*.js',
      'vite.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'playwright.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        // Common Node globals used by config files
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {},
    rules: {
      ...js.configs.recommended.rules,
      // Ensure Node globals don't error
      'no-undef': 'off',
      // Backend code isn't React; silence frontend-specific rules
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'off',
      // Keep unused vars as warnings, ignore underscored args/vars/caught errors
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Disallow direct Postgres access; use Supabase client instead
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pg', message: 'Use Supabase client (backend/lib/supabase-db.js) instead of pg' },
          ],
        },
      ],
    },
  },
  // VS Code extension: CommonJS / Node.js context
  {
    files: ['braid-llm-kit/editor/vscode/**/*.js'],
    ignores: ['braid-llm-kit/editor/vscode/server/**'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
      sourceType: 'commonjs',
    },
    plugins: {},
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // VS Code extension LSP server: ESM / Node.js context
  {
    files: ['braid-llm-kit/editor/vscode/server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
        process: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {},
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Maintenance scripts override: allow 'pg' in non-runtime backend scripts
  {
    files: ['backend/*.js', 'backend/scripts/**/*.js'],
    ignores: ['backend/server.js', 'backend/routes/**', 'backend/workers/**', 'backend/lib/**', 'backend/middleware/**'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': 'off',
    },
  },
  // Root scripts override: Node environment for maintenance/utility scripts at repo root
  {
    files: ['*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Tests override: Playwright tests run in Node; allow process and test globals
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // tests aren't React components
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'off',
      // Allow dev-oriented patterns
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Functions override: parse Deno-style / ESM worker files and allow Deno global
  {
    files: ['src/functions/**'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        Deno: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // keep general rules but avoid treating Deno globals as undefined errors
      'no-undef': 'off',
      // let react rules remain off for these serverless/function files
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  // File-specific override: allow global Deno in middleware utilities
  {
    files: ['src/functions/_middleware.js'],
    languageOptions: {
      globals: {
        Deno: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  // TypeScript files configuration - enforce type safety
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': 'off', // Disable base rule for TS
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Type safety rules - prevent any usage (warn for gradual migration)
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // TypeScript test files - allow Node.js globals
  {
    files: ['tests/**/*.ts', 'tests/**/*.spec.ts', 'src/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // TypeScript backend/Node files - allow Node.js globals
  {
    files: ['braid-mcp-node-server/**/*.ts', 'backend/**/*.ts', 'orchestra/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Disable ESLint rules that conflict with Prettier formatting
  prettier,
];
