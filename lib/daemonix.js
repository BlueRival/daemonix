"use strict";

(function () {

	var noop = function () {
	};

	var Daemonix = module.exports = function ( container ) {

		var self = this;

		var config = container.get( 'config' );
		self._cluster = container.get( 'cluster' );
		self._process = container.get( 'process' );
		self._os = container.get( 'os' );

		if ( !config ) {
			config = {};
		}

		if ( typeof self._workers !== 'object' ) {
			self._workers = {
				count:           1,
				restartTimeout:  1000,
				shutdownTimeout: 10000
			};
		}

		self._app = config.app;
		self._scribe = ( typeof config.scribe === 'object' ) ?
									 config.scribe : { log: noop };
		self._workers = {
			count:           config.workers.count,
			restartTimeout:  ( config.workers.restartTimeout < 1000 ?
												 config.workers.restartTimeout : 1000 ),
			shutdownTimeout: ( config.workers.shutdownTimeout > 30000 ?
												 config.workers.shutdownTimeout : 10000 )
		};


		if ( typeof config.app !== 'function' ) {
			throw new Error( 'config.app needs to be a class' );
		}

		if ( self._workers.count !== 'auto' && self._workers.count < 1 ) {
			throw new Error( 'config.workers.count needs to be "auto", or an integer > 0' );
		}

		// graceful shutdown handling
		self.terminationHandler = function () {
			self._process.exit( 1 );
		};
		var terminationHandlerScope = function ( type ) {
			return function () {
				self.terminationHandler( type );
			};
		};

		// catches Ctrl+C a.k.a kill 2 [[pid]
		self._process.on( 'SIGINT', terminationHandlerScope( 'SIGINT' ) );

		// catches kill [pid] a.k.a. kill 15 [pid]
		self._process.on( 'SIGTERM', terminationHandlerScope( 'SIGTERM' ) );

		// determine if master is shutting down, used to determine when to spawn a
		// worker when another worker has died.
		self._shuttingDown = false;

		// determine what we are and get started
		if ( self._cluster.isMaster ) {
			self._startMaster();
		} else {
			self._startWorker();
		}

	};

	/**
	 * _startMaster()
	 *
	 * Sets up the process to run as the master process, which will control the
	 * cluster.
	 *
	 */
	Daemonix.prototype._startMaster = function () {

		var self = this;

		// determine number of workers to use
		var targetWorkerCount = null;
		switch ( self._workers.count ) {

			case 'auto':
				targetWorkerCount = self._os.cpus().length;
				break;

			default:
				targetWorkerCount = parseInt( self._workers, 10 );
				break;

		}
		if ( targetWorkerCount < 1 ) {
			targetWorkerCount = 1;
		}

		// counts the number of worker processes
		function workerCount() {

			var count = 0;

			for ( var i in self._cluster.workers ) {
				if ( self._cluster.workers.hasOwnProperty( i ) ) {
					count++;
				}
			}

			return count;

		}

		// graceful shutdown handle
		self.terminationHandler = function () {

			if ( self._shuttingDown === true ) {
				return;
			}
			self._shuttingDown = true;

			// shutdown all worker processes
			for ( var pid in self._cluster.workers ) {
				if ( self._cluster.workers.hasOwnProperty( pid ) ) {
					self._cluster.workers[pid].process.kill( 'SIGTERM' );
				}
			}

		};

		// watch workers
		self._cluster.on( 'exit', function ( worker ) {

			// see if this is a planned exit of a worker process
			if ( self._shuttingDown ) {

				self._scribe.log( 'info', '[' + worker.pid + '] worker shut down' );

				// we may do a keep alive thing in the future, but for now self.is ok
				if ( workerCount() < 1 ) {
					self._scribe.log( 'info', '[' + self._process.pid + '] workers exited, shutting down daemon' );
					self._process.exit( 0 );
				}

			}
			else {

				self._scribe.log( 'warning', '[' + worker.pid + '] worker exited unexpectedly, restarting in ' + self._workers.restartTimeout + 'ms' );

				// we are not supposed to be shutting down, restart the worker.
				setTimeout( function () {
					self._cluster.fork();
				}, self._workers.restartTimeout );

			}

		} );

		// Fork worker processes.
		for ( var i = 0; i < targetWorkerCount; i++ ) {
			self._cluster.fork();
		}

	};

	/**
	 * _startWorker()
	 *
	 * Sets up the process to run as the worker self._process.
	 *
	 */
	Daemonix.prototype._startWorker = function () {

		var self = this;
		var app = new (self._app)( self._process.env.NODE_ENV || 'development' );

		// graceful shutdown handle
		self.terminationHandler = function ( type ) {

			// some operating systems signal parent and child processes with Ctrl+c
			// on the keyboard. we want to ignore that in the child and wait for the
			// master to pass SIGTERM
			if ( type === 'SIGINT' ) {
				return;
			}

			// only handle termination once
			if ( self._shuttingDown ) {
				return;
			}
			self._shuttingDown = true;

			var doneCalled = false;
			var doneTimeout = null;
			var done = function () {

				doneCalled = true;

				if ( doneTimeout ) {
					clearTimeout( doneTimeout );
					doneTimeout = null;
				}

				if ( !doneCalled ) {
					self._process.exit( 0 );
				}

			};

			// ensure we finish eventually
			doneTimeout = setTimeout( function () {
				self._scribe.log( 'warning', 'app.dinit() timed out' );
				doneTimeout = null;
				done();
			}, self._workers.shutdownTimeout );

			try {
				// tell the app to stop everything
				app.dinit( done );
			} catch ( e ) {
				done();
			}

		};

		try {
			app.init( function ( err ) {
				if ( err ) {
					self.terminationHandler();
				}
			} );
		} catch ( e ) {
			self.terminationHandler();
		}

	};

})();

