'use strict';

(function() {

  var Daemonix = require( './lib/daemonix' );

  var daemonix = null;

  module.exports = function( container ) {

    // only generate one of these
    if ( daemonix === null ) {

      var defaults = {
        cluster: require( 'cluster' ),
        os:      require( 'os' ),
        process: process,
        scribe:  function() {
          // NO-OP
        }
      };

      for ( var field in defaults ) {
        if ( defaults.hasOwnProperty( field ) && !container.has( field ) ) {
          container.set( field, defaults[ field ] );
        }
      }

      daemonix = new Daemonix( container );

    }

    return daemonix;

  };

})();
