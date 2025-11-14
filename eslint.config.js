import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist', '**/dist/**', 'braid-mcp-node-server/dist/**', 'logseq/**', 'scripts/**', 'backend/node_modules/**', 'src/functions/**', 'src/functions.archived/**', 'node_modules/**', '.DS_Store', '*.local', '.env.*', '*.env', 'logseq/bak/**', 'playwright-report/**', 'test-results/**'] },
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
      // Allow underscore-prefixed unused vars and ignore React import in JSX runtime projects
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(?:_|React)$' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
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
    files: ['backend/**/*.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'playwright.config.js'],
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
      // Keep unused vars as warnings, ignore underscored args/vars
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Root scripts override: Node environment for maintenance/utility scripts at repo root
  {
    files: [
      '*.js',
      'scripts/**/*.js',
    ],
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
  // Disable ESLint rules that conflict with Prettier formatting
  prettier,
]
