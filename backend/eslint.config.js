import js from '@eslint/js';

// Flat config: @eslint/js recommended only (OQ-35 APPROVED). Node 20 globals are listed here
// rather than pulled from a plugin or the `globals` package.
const nodeGlobals = Object.fromEntries(
  [
    'process', 'Buffer', 'console', 'URL', 'URLSearchParams', 'crypto', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'setImmediate', 'structuredClone', 'TextEncoder', 'TextDecoder', 'AbortController',
  ].map((name) => [name, 'readonly']),
);

export default [
  { ignores: ['node_modules/**', 'uploads/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
];
