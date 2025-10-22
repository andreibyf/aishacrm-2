import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
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
      'no-unused-vars': 'warn', // Changed to warning - unused imports don't break functionality
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Backend (Node.js) override: allow Node globals like `process`, disable React rules
  {
    files: ['backend/**/*.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
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
]
