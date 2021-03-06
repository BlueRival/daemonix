'use strict';

let assert = require( 'assert' );
let Daemonix = require( '../../lib/daemonix' );
let EventEmitter = require( 'events' ).EventEmitter;
let nextPid = 100;

describe( 'Daemonix', function () {

  let App = null;
  let container = null;
  let logEntries = null;
  let AppConstructor = null;
  let AppEnv = null;
  let AppInit = null;
  let AppDinit = null;
  let cluster = null;
  let os = null;
  let globalProcess = null;
  let lastSetTimeout = null;
  let realSetTimeout = setTimeout;

  global.setTimeout = function ( func, timeout ) {
    lastSetTimeout = timeout;
    realSetTimeout( func, 10 );
  };

  let killCount = 0;

  let Process = function ( id ) {
    EventEmitter.call( this );
    this.pid = id;
  };
  require( 'util' ).inherits( Process, EventEmitter );

  Process.prototype.kill = function () {
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

    let scribe = function () {
      logEntries.push( arguments );
    };

    let Cluster = function () {
      EventEmitter.call( this );
      this.isMaster = true;
      this.workers = {};
      this.forkCount = 0;
      this.exitCount = 0;
    };
    require( 'util' ).inherits( Cluster, EventEmitter );

    Cluster.prototype.fork = function () {
      let self = this;
      self.forkCount++;

      ( function ( pid ) {

        self.workers[pid] = {
          process: new Process( pid )
        };
        self.workers[pid].process.on( 'exit', function () {

          self.exitCount++;
          let worker = self.workers[pid];
          delete self.workers[pid];
          self.emit( 'exit', worker );

        } );

        self.emit( 'fork', self.workers[pid] );

      } )( nextPid );

      nextPid++;
    };

    Cluster.prototype.workerCount = function () {

      let count = 0;

      for ( let i in this.workers ) {
        if ( Object.prototype.hasOwnProperty.call( this.workers, i ) ) {
          count++;
        }
      }

      return count;

    };

    Cluster.prototype.killWorker = function () {
      for ( let i in this.workers ) {
        if ( Object.prototype.hasOwnProperty.call( this.workers, i ) ) {
          let worker = this.workers[i];
          worker.process.kill();
          break;
        }
      }
    };

    cluster = new Cluster();

    os = {
      cpus: function () {
        return {
          length: this.cpuLength
        };
      },
      cpuLength: 3
    };

    let GlobalProcess = function () {
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

    container = {
      app: App,
      cluster: cluster,
      os: os,
      process: globalProcess,
      log: scribe
    };

  } );

  describe( 'master', function () {

    it( 'should work with a default config', function () {

      // eslint-disable-next-line no-new
      new Daemonix( container );

      globalProcess.emit( 'SIGINT' );

      // eslint-disable-next-line no-new
      new Daemonix( container );

      globalProcess.emit( 'SIGTERM' );

      assert.strictEqual( cluster.forkCount, 4 );
      assert.strictEqual( cluster.exitCount, 4 );
      assert.strictEqual( killCount, 4 );

    } );

    it( 'should restart the worker with a default config', function ( done ) {

      // eslint-disable-next-line no-new
      new Daemonix( container );

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

      container.app = App;
      container.workers = {
        count: 3,
        restartTimeout: 3000
      };

      // eslint-disable-next-line no-new
      new Daemonix( container );

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

      container.app = App;
      container.workers = {
        count: 1
      };

      // eslint-disable-next-line no-new
      new Daemonix( container );

      assert.strictEqual( cluster.forkCount, 1 );

      container.app = App;
      container.workers = {
        count: 10
      };

      // eslint-disable-next-line no-new
      new Daemonix( container );

      assert.strictEqual( cluster.forkCount, 11 );

    } );

    it( 'should start the correct number of workers for auto count', function () {

      container.app = App;
      container.workers = {
        count: 'auto'
      };

      // eslint-disable-next-line no-new
      new Daemonix( container );

      assert.strictEqual( cluster.forkCount, os.cpuLength );

    } );

  } );

  describe( 'worker', function () {

    beforeEach( function () {

      cluster.isMaster = false;

    } );

    it( 'should instantiate, init and dinit App, once each', function ( done ) {

      // eslint-disable-next-line no-new
      new Daemonix( container );

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

      // eslint-disable-next-line no-new
      new Daemonix( container );

      globalProcess.emit( 'SIGINT' );

      assert.strictEqual( AppEnv, 'testing' );
      assert.strictEqual( AppConstructor, 1 );
      assert.strictEqual( AppInit, 1 );
      assert.strictEqual( AppDinit, 0 );

    } );

  } );

} )
;
