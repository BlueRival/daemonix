'use strict';

let Daemonix = require('./lib/daemonix');

function daemonix(config) {
  return new Daemonix(config);
}

module.exports = daemonix;
module.exports.daemonix = daemonix;
module.exports.default = daemonix;
