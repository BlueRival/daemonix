'use strict';

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    globals: true,
    bail: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
