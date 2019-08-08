'use strict';

const __ = require( 'doublescore' );
const cluster = require( 'cluster' );
const os = require( 'os' );

let noop = function () {
};

let defaultConfig = {
  workers: {
    restartOnException: true,
    count: 2,
    restartTimeout: 1000,
    shutdownTimeout: 30000
  }
};

class Daemonix {

  constructor( config ) {

    this._App = config.app;
    this._log = config.log || noop;

    // these are here for testing purposes, in normal use you would never pass in overrides for cluster, process or os.
    this._cluster = config.cluster || cluster;
    this._process = config.process || process;
    this._os = config.os || os;

    this._workersConfig = __( defaultConfig.workers ).mixin( config.workers );

    // first thing, handle uncaught exceptions
    let restartOnExceptionWarning = () => {
      if ( !this._workersConfig.restartOnException ) {
        console.error(
          'DAEMONIX RUNNING WITH restartOnException set to FALSE. THIS SHOULD ONLY BE USED FOR DEBUG AND TESTING. DO NOT RUN THIS IN PRODUCTION.'
        );
      }
    };
    restartOnExceptionWarning();
    this._process.on( 'uncaughtException', ( err ) => {

      restartOnExceptionWarning();

      this._log( 'error', 'UNCAUGHT EXCEPTION: ' + err.message, err.stack );

      if ( this._workersConfig.restartOnException ) {

        this._process.kill( this._process.pid, 'SIGTERM' );

        // if the kill didn't work, force this thing down
        setTimeout( () => {
          this._process.kill( this._process.pid, 'SIGKILL' );
        }, 5000 );

      }

    } );

    // default termination is straight kill, until App class is ready to init. Also, shutdown is different for master
    // and workers.
    this.terminationHandler = () => {
      this._process.exit( 0 );
    };

    // graceful shutdown handling, setup
    let terminationHandlerScope = ( type ) => {
      return () => {
        this.terminationHandler( type );
      };
    };

    // catches Ctrl+C a.k.a kill 2 [[pid]
    this._process.on( 'SIGINT', terminationHandlerScope( 'SIGINT' ) );

    // catches kill [pid] a.k.a. kill 15 [pid]
    this._process.on( 'SIGTERM', terminationHandlerScope( 'SIGTERM' ) );

    // determine if master is shutting down, used to determine when to spawn a
    // worker when another worker has died.
    this._shuttingDown = false;

    // determine what we are and get started
    if ( this._cluster.isMaster ) {
      this._startMaster();
    } else {
      this._startWorker();
    }

  }

  /**
   * _startMaster()
   *
   * Sets up the process to run as the master process, which will control the cluster.
   *
   */
  _startMaster() {

    // determine number of workers to use
    let targetWorkerCount = null;
    switch ( this._workersConfig.count ) {

      case 'auto':
        targetWorkerCount = this._os.cpus().length;
        break;

      default:
        targetWorkerCount = parseInt( this._workersConfig.count, 10 );
        break;

    }
    if ( isNaN( targetWorkerCount ) || targetWorkerCount < 1 ) {
      targetWorkerCount = 1;
    }

    // counts the number of worker processes
    let workerCount = () => {

      let count = 0;

      for ( let i in this._cluster.workers ) {
        if ( this._cluster.workers.hasOwnProperty( i ) ) {
          count++;
        }
      }

      return count;

    };

    // graceful shutdown handle
    this.terminationHandler = () => {

      let force = () => {

        // force shutdown all worker processes
        for ( let pid in this._cluster.workers ) {
          if ( this._cluster.workers.hasOwnProperty( pid ) ) {
            this._cluster.workers[ pid ].process.kill( 'SIGKILL' );
          }
        }

        // give OS a moment to settle from the workers forced down
        setTimeout( () => {
          this._process.exit( 1 );
        }, 1000 );

      };

      // we are already shutting down but another signal came in, force down
      if ( this._shuttingDown === true ) {
        force();
        return;
      }
      this._shuttingDown = true;

      // shutdown all worker processes
      for ( let pid in this._cluster.workers ) {
        if ( this._cluster.workers.hasOwnProperty( pid ) ) {
          this._cluster.workers[ pid ].process.kill( 'SIGTERM' );
        }
      }

      // we have thirty seconds before force!
      setTimeout( force, this._workersConfig.shutdownTimeout );

    };

    this._cluster.on( 'fork', ( worker ) => {
      this._log( 'info', 'worker ' + worker.process.pid + ' started' );
    } );

    let forkWorker = () => {
      this._cluster.fork();
    };

    // watch workers
    this._cluster.on( 'exit', ( worker ) => {

      // see if this is a planned exit of a worker process, or if the worker exited by accident, such as an
      // uncaught exception
      if ( this._shuttingDown ) {

        this._log( 'info', 'worker ' + worker.process.pid + ' shutdown' );

        // we may do a keep alive thing in the future, but for now this.is ok
        if ( workerCount() < 1 ) {
          this._log( 'info', 'workers exited, shutting down daemon' );
          this._process.exit( 0 );
        }

      } else {

        this._log( 'warning',
          'worker ' + worker.process.pid + ' exited unexpectedly, restarting in ' + this._workersConfig.restartTimeout + 'ms' );

        // we are not supposed to be shutting down, restart the worker.
        setTimeout( () => {
          forkWorker();
        }, this._workersConfig.restartTimeout );

      }

    } );

    // Initial fork of worker processes.
    for ( let i = 0; i < targetWorkerCount; i++ ) {
      forkWorker();
    }

  }

  /**
   * _startWorker()
   *
   * Sets up the process to run as the worker process.
   *
   */
  _startWorker() {

    // initialize the App class
    let app = new this._App( this._process.env.NODE_ENV || 'development' );

    // graceful shutdown handle
    this.terminationHandler = ( type ) => {

      // some operating systems signal parent and child processes with Ctrl+c
      // on the keyboard. we want to ignore that in the child and wait for the
      // master process to pass SIGTERM
      if ( type === 'SIGINT' ) {
        return;
      }

      // only handle termination once
      if ( this._shuttingDown ) {
        return;
      }
      this._shuttingDown = true;

      let doneCalled = false;
      let doneTimeout = null;
      let done = () => {

        if ( doneTimeout ) {
          clearTimeout( doneTimeout );
          doneTimeout = null;
        }

        if ( !doneCalled ) {
          doneCalled = true;
          this._process.exit( 0 );
        }

      };

      // ensure we finish eventually
      doneTimeout = setTimeout( () => {
        this._log( 'warning', 'app.dinit() timed out' );
        doneTimeout = null;
        done();
      }, this._workersConfig.shutdownTimeout );

      try {
        // tell the app to stop everything
        app.dinit( ( err ) => {

          if ( err ) {
            this._log( 'error', 'app dinit err: ' + err.message, err.stack );
          }

          done();
        } );
      } catch ( err ) {
        this._log( 'error', 'app dinit err: ' + err.message, err.stack );
        done();
      }

    };

    try {
      app.init( ( err ) => {
        if ( err ) {
          this._log( 'error', 'app init err: ' + err.message, err.stack );
          this.terminationHandler();
        }
      } );
    } catch ( err ) {
      this._log( 'error', 'app init err: ' + err.message, err.stack );
      this.terminationHandler();
    }

  }

}

module.exports = Daemonix;
