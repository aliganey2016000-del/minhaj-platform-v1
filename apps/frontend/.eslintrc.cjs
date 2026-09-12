module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    // These rules are enabled incrementally; the existing codebase has a
    // sizeable pre-lint baseline. New feature work should clean its own
    // warnings before these are promoted back to errors.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-empty': 'off',
    'prefer-const': 'off',
    'no-useless-escape': 'off',
    'react-hooks/exhaustive-deps': 'off',
  },
};
