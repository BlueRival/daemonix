"use strict";

(function () {

	var Daemonix = require( './lib/daemonix' );

	var daemonix = null;

	module.exports = function ( config ) {

		// only generate one of these
		if ( daemonix === null ) {

			var Container = require( 'sidi' ).Container;

			var container = new Container();

			container.set( 'cluster', require( 'cluster' ) );
			container.set( 'config', config );
			container.set( 'os', require( 'os' ) );
			container.set( 'process', process );

			daemonix = new Daemonix( container );

		}

		return daemonix;

	};

})();

