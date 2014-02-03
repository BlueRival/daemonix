daemonix
===

Daemonix is a tool for deploying and managing NodeJS systems as a daemon in Linux/Unix environments.

Were are targeting Ubuntu 12.04+ for our initial release but other distros will come online eventually. No, we will never try to make this work for Windows in any way shape or form.

Pronunciation: day-mon-icks

Basic Usage
===

The minimum to have daemonix manage your process is just this in your server.js.

```javascript

// You must specify an App class, that provides this interface
var App = function( env ) {
	// env is the environment you are in
};
App.prototype.init = function(done) {
	// done should be called after the app is finished being initialized, opening
	// web application ports, creating other resources, etc.
	setImmediate(done, null);
};
App.prototype.dinit = function(done) {
  // done should be called when app is finished being de-initialized, closing
  // web servers, etc.
	setImmediate(done, null);
};

var daemonix = require( 'daemonix' )( { app: App } );

```

With this code, Daemonix will automatically spin up two worker processes, and manage the worker's presence. If the workers die for any reason, Daemonix will restart it. This minimizes the need for utilities like forever.

If any worker dies, it will be restarted in 1000 ms. If the master process exits, then it will give each worker up to 30000 ms to call ```done()``` on ```dinit()```.

Advanced Usage
===

If you want to customize control, you can override any of the parameters like this.

```javascript

var daemonix = require( 'daemonix' )( {
  app: App
  workers: {
    count: [ int | 'auto'], // int > 0, specifies exact number of workers to use, auto will use one worker per CPU core. default: 2
    restartTimeout: [ int ], // number of milliseconds to wait before restarting a failed worker. default: 1000
    shutdownTimeout: [ int ] // number of milliseconds to wait on app.dinit(done); to call done(null) before the worker is killed. default: 30000
} );

```

Extra Advanced Usage
===
