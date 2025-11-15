module.exports = {
  env: {
    node: true,
    commonjs: true,
    es6: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'script' // Use 'script' for CommonJS
  },
  rules: {
    'no-undef': 'off',
    'no-unused-vars': 'warn'
  }
};
