'use strict';

let Deamonix = require( './lib/daemonix' );

module.exports = function ( config ) {
  return new Deamonix( config );
};