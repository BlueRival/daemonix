'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.vitest,
        localRequire: 'writable',
      },
    },
    rules: {
      camelcase: 'error',
      curly: 'error',
      'default-case': 'error',
      'dot-notation': ['error', { allowKeywords: true }],
      eqeqeq: 'error',
      'getter-return': ['error', { allowImplicit: false }],
      'guard-for-in': 'error',
      'new-cap': ['error', { newIsCap: true }],
      'no-eq-null': 'error',
      'no-extend-native': 'error',
      'no-implicit-globals': 'error',
      'no-loop-func': 'error',
      'no-new': 'error',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',
      'no-undefined': 'error',
      'no-unused-expressions': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'vars-on-top': 'error',
      strict: ['error', 'global'],
    },
  },
];
