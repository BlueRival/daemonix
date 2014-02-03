"use strict";

var assert = require( 'assert' );
var Container = require( 'sidi' ).Container;
var Daemonix = require( '../lib/daemonix' );
var EventEmitter = require( 'events' ).EventEmitter;
var nextPid = 100;

describe( 'Daemonix', function () {

  var App = null;
  var container = null;
  var logEntries = null;
  var AppConstructor = null;
  var AppEnv = null;
  var AppInit = null;
  var AppDinit = null;
  var cluster = null;
  var os = null;
  var globalProcess = null;
  var lastSetTimeout = null;
  var realSetTimeout = setTimeout;

  GLOBAL.setTimeout = function ( func, timeout ) {
    lastSetTimeout = timeout;
    realSetTimeout( func, 10 );
  };

  var killCount = 0;

  var Process = function ( id ) {
    EventEmitter.call( this );
    this.pid = id;
  };
  require( 'util' ).inherits( Process, EventEmitter );

  Process.prototype.kill = function ( signal ) {
    killCount++;
    this.emit( 'exit' );
  };

  beforeEach( function () {

    logEntries = [];

    AppEnv = null;
    AppConstructor = 0;
    AppInit = 0;
    AppDinit = 0;

    App = function ( env ) {
      AppEnv = env;
      AppConstructor++;
    };

    App.prototype.init = function ( done ) {
      AppInit++;
      setImmediate( done, null );
    };

    App.prototype.dinit = function ( done ) {
      AppDinit++;
      setImmediate( done, null );
    };

    var scribe = function ( level, message, meta ) {
      logEntries.push( arguments );
    };

    var Cluster = function () {
      EventEmitter.call( this );
      this.isMaster = true;
      this.workers = {};
      this.forkCount = 0;
      this.exitCount = 0;
    };
    require( 'util' ).inherits( Cluster, EventEmitter );

    Cluster.prototype.fork = function () {
      var self = this;
      self.forkCount++;

      (function ( pid ) {

        self.workers[pid] = {
          process: new Process( pid )
        };
        self.workers[pid].process.on( 'exit', function () {

          self.exitCount++;
          var worker = self.workers[pid];
          delete self.workers[pid];
          self.emit( 'exit', worker );

        } );

      })( nextPid );

      nextPid++;
    };

    Cluster.prototype.workerCount = function () {

      var count = 0;

      for ( var i in this.workers ) {
        if ( this.workers.hasOwnProperty( i ) ) {
          count++;
        }
      }

      return count;

    };

    Cluster.prototype.killWorker = function () {
      for ( var i in this.workers ) {
        if ( this.workers.hasOwnProperty( i ) ) {
          var worker = this.workers[i];
          worker.process.kill();
          break;
        }
      }
    };

    cluster = new Cluster();

    os = {
      cpus:      function () {
        return {
          length: this.cpuLength
        };
      },
      cpuLength: 3
    };

    var GlobalProcess = function () {
      EventEmitter.call( this );
      this.pid = 50;
      this.exitCount = 0;
      this.lastExitCode = null;
      this.lastKillPid = null;
      this.lastKillSignal = null;
      this.env = {
        NODE_ENV: 'testing'
      };
    };
    require( 'util' ).inherits( GlobalProcess, EventEmitter );

    GlobalProcess.prototype.exit = function ( code ) {
      this.exitCount++;
      this.lastExitCode = code;
    };

    GlobalProcess.prototype.kill = function ( pid, signal ) {
      this.lastKillPid = pid;
      this.lastKillSignal = signal;
    };

    globalProcess = new GlobalProcess();

    container = new Container();

    container.set( 'config', { app: App } );
    container.set( 'cluster', cluster );
    container.set( 'os', os );
    container.set( 'process', globalProcess );
    container.set( 'scribe', scribe );

  } );

  describe( 'master', function () {

    it( 'should work with a default config', function () {

      var daemonix = new Daemonix( container );
      globalProcess.emit( 'SIGINT' );

      daemonix = new Daemonix( container );
      globalProcess.emit( 'SIGTERM' );

      assert.strictEqual( cluster.forkCount, 4 );
      assert.strictEqual( cluster.exitCount, 4 );
      assert.strictEqual( killCount, 4 );

    } );

    it( 'should work with an overridden container', function () {

//			var daemonixFactory = require( '../index' );
//
//			// apply override
//			daemonixFactory( container );
//
//			// generate instance
//
//			daemonixFactory( {
//												 app: App
//											 } );
//
////
////			globalProcess.emit( 'SIGINT' );
////
////			daemonix = new Daemonix( container );
////			globalProcess.emit( 'SIGTERM' );
////
//			assert.strictEqual( cluster.forkCount, 2 );
//			assert.strictEqual( cluster.exitCount, 0 );
//			assert.strictEqual( killCount, 4 );

    } );

    it( 'should restart the worker with a default config', function ( done ) {

      var daemonix = new Daemonix( container );

      cluster.killWorker();

      realSetTimeout( function () {

        try {
          assert.strictEqual( lastSetTimeout, 1000 );
          lastSetTimeout = null;
          assert.strictEqual( cluster.forkCount, 3 );
          assert.strictEqual( cluster.exitCount, 1 );

          done();
        } catch ( e ) {
          done( e );
        }

      }, 500 );

    } );

    it( 'should restart the worker with a custom config', function ( done ) {

      container.set( 'config', {
        app:     App,
        workers: {
          count:          3,
          restartTimeout: 3000
        }
      } );

      var daemonix = new Daemonix( container );

      cluster.killWorker();
      cluster.killWorker();

      realSetTimeout( function () {

        try {
          assert.strictEqual( lastSetTimeout, 3000 );
          lastSetTimeout = null;
          assert.strictEqual( cluster.forkCount, 5 );
          assert.strictEqual( cluster.exitCount, 2 );

          done();
        } catch ( e ) {
          done( e );
        }

      }, 100 );

    } );

    it( 'should start the correct number of workers for specified count', function () {

      container.set( 'config', {
        app:     App,
        workers: {
          count: 1
        }
      } );

      var daemonix = new Daemonix( container );

      assert.strictEqual( cluster.forkCount, 1 );

      container.set( 'config', {
        app:     App,
        workers: {
          count: 10
        }
      } );

      daemonix = new Daemonix( container );

      assert.strictEqual( cluster.forkCount, 11 );

    } );

    it( 'should start the correct number of workers for auto count', function () {

      container.set( 'config', {
        app:     App,
        workers: {
          count: 'auto'
        }
      } );

      var daemonix = new Daemonix( container );

      assert.strictEqual( cluster.forkCount, os.cpuLength );

    } );

  } );

  describe( 'worker', function () {

    beforeEach( function () {

      cluster.isMaster = false;

    } );

    it( 'should instantiate, init and dinit App, once each', function ( done ) {

      var daemonix = new Daemonix( container );
      globalProcess.emit( 'SIGTERM' );
      globalProcess.emit( 'SIGTERM' );
      globalProcess.emit( 'SIGINT' );
      globalProcess.emit( 'SIGTERM' );
      globalProcess.emit( 'SIGINT' );
      globalProcess.emit( 'SIGTERM' );

      realSetTimeout( function () {
        try {
          assert.strictEqual( AppEnv, 'testing' );
          assert.strictEqual( AppConstructor, 1 );
          assert.strictEqual( AppInit, 1 );
          assert.strictEqual( AppDinit, 1 );
          assert.strictEqual( globalProcess.exitCount, 1 );

          done();
        } catch ( e ) {
          done( e );
        }
      }, 100 );

    } );

    it( 'should instantiate, init and that is all', function () {

      var daemonix = new Daemonix( container );
      globalProcess.emit( 'SIGINT' );

      assert.strictEqual( AppEnv, 'testing' );
      assert.strictEqual( AppConstructor, 1 );
      assert.strictEqual( AppInit, 1 );
      assert.strictEqual( AppDinit, 0 );

    } );

  } );

} )
;
