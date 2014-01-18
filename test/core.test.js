"use strict";

var assert = require( 'assert' );
var daemonix = require( 'daemonix' );

describe( 'Daemonix', function () {

	var lastLogEntry = [null, null, null];

	var App = function ( env ) {
		this.env = env;
		this.init = false;
		this.dinit = false;
	};

	App.prototype.init = function ( done ) {
		this.init = true;
		setImmediate( done, null );
	};

	App.prototype.dinit = function ( done ) {
		this.dinit = true;
		setImmediate( done, null );
	};

	var scribe = {
		log: function ( level, message, meta ) {
			lastLogEntry = [level, message, meta];
		}
	};

	daemonix(
		{
			app:    App,
			scribe: scribe
		}
	);

} )
;
