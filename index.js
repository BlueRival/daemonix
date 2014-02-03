"use strict";

(function () {

  var Daemonix = require( './lib/daemonix' );
  var Container = require( 'sidi' ).Container;
  var container = new Container();
  var daemonix = null;

  container.set( 'cluster', require( 'cluster' ) );
  container.set( 'os', require( 'os' ) );
  container.set( 'process', process );

  module.exports = function ( config ) {

    // only generate one of these
    if ( daemonix === null ) {

      // allow overrides
      if ( config instanceof Container ) {

        var fields = [
          'config',
          'cluster',
          'os',
          'process',
          'scribe'
        ];
        var field = null;

        for ( var i = 0; i < fields.length; i++ ) {
          field = config.get( fields[i] );
          if ( typeof field !== 'undefined' ) {
            container.set( fields[i], field );
          }
        }

      } else {

        container.set( 'config', config );

        daemonix = new Daemonix( container );

      }

    }

    return daemonix;

  };

})();
