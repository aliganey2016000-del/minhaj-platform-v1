module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    // Same incremental baseline as apps/frontend/.eslintrc.cjs: the backend
    // had no working lint before, so these start off and get promoted once
    // the existing code is cleaned up.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-empty': 'off',
    'prefer-const': 'off',
    'no-useless-escape': 'off',
    // Intentional patterns in this codebase: `declare global { namespace
    // Express }` request augmentation, ts-node e2e tests pulling those
    // augmentations in via triple-slash references, and the website HTML
    // sanitizer deliberately matching control characters.
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    'no-control-regex': 'off',
    '@typescript-eslint/ban-types': 'off',
  },
};
