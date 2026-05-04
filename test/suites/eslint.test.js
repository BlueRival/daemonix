'use strict';

const { glob } = require('glob');
const { ESLint } = require('eslint');
const assert = require('assert');

// build a list of all files to check
const paths = [];

paths.push(...glob.sync(`${process.cwd()}/*.js`));
paths.push(...glob.sync(`${process.cwd()}/lib/**/*.js`));
paths.push(...glob.sync(`${process.cwd()}/test/**/*.js`));

// instantiate ESLint, use eslint.config.js (flat config)
let eslint = null;

function generateTest(path) {
  it(`should validate ${path}`, async function () {
    assert(eslint, 'ESLint instance not created');

    const results = await eslint.lintFiles([path]);
    const messages = results[0].messages;

    if (messages.length > 0) {
      assert.fail(formatMessages(path, messages));
    }
  });
}

function formatMessages(path, messages) {
  const errors = messages.map(message => {
    return `${path}: ${message.line}:${message.column} ${message.message.slice(0, -1)} - ${message.ruleId}\n`;
  });

  return `\n${errors.join('')}`;
}

// generate tests for each file found
describe('ESLint', function () {
  eslint = new ESLint();

  paths.forEach(path => generateTest(path));
});
