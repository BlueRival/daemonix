daemonix
===

Daemonix is an awesome tool for managing NodeJS processes/clusters as a daemon in Linux/Unix environments.

No, we will never try to make this work for Windows in any way shape or form.

Pronunciation: day-mon-icks

## Version 3.0.0
This is a big re-write to the interface of the Deamonix process management component, and a complete 
removal of the Deamonix CLI tool for deploying processes. See the CLI section below for reasoning behind removing the
CLI tool.

Basic Usage
===

The minimum to have daemonix manage your process is just this in your server.js.

```javascript

class App{
  
  constructor(env) {
    // env is a string containing the env name, set by NODE_ENV
  }
  
  init(done) {
    // This is how we do graceful startup.
    // init() will get called when the process starts. init() must call done() once the App is 100% up and running.
  }
  
  dinit(done) {
    // This is how we do graceful shutdown.
    // dinit() will get called when the daemon receives a shutdown signal from the OS. It will trigger once for 
    // Ctrl+c, kill CLI calls, service stop commands from upstart or sysv control systems, etc. dinit() 
    // must call done() once the App is 100% ready for the process to die. If the app doesn't call done() in a
    // reasonable amount of time, the process will be forceably closed.
  }
  
}
 
const daemonix = require( 'daemonix' );
 
// tell the daemon its time to work
daemonix( { app: App } );
```

With this code, Daemonix will automatically spin up two worker processes, and manage the worker's presence. If the 
workers die for any reason, Daemonix will restart it. This minimizes, and even removes, the need for utilities like 
forever.

If any worker dies, it will be restarted in 1000 ms. If the master process exits, then it will give each worker up to 
30000 ms to call ```done()``` on ```dinit()```.

See [@StringStack/core](https://www.npmjs.com/package/@stringstack/core) for an awesome framework that generates an App 
class with built-in dependency management. 

Advanced Usage
===

If you want to customize control, you can override any of the parameters like this.

```javascript

class App{
  
  constructor(env) {
    // env is a string containing the env name, set by NODE_ENV
  }
  
  init(done) {
    // This is how we do graceful startup.
    // init() will get called when the process starts. init() must call done() once the App is 100% up and running.
  }
  
  dinit(done) {
    // This is how we do graceful shutdown.
    // dinit() will get called when the daemon receives a shutdown signal from the OS. It will trigger once for 
    // Ctrl+c, kill CLI calls, service stop commands from upstart or sysv control systems, etc. dinit() 
    // must call done() once the App is 100% ready for the process to die. If the app doesn't call done() in a
    // reasonable amount of time, the process will be forceably closed.
  }
  
}
 
const daemonix = require( 'daemonix' );
 
// tell the daemon its time to work
daemonix( { 
  app: App,
  log: function( level, message, meta ) {
    
    // if a meta object is passed, stringify it and attach to message
    if ( arguments.length === 3 ) {
      message += ': ' + JSON.stringify( meta );
    }

    console.error( new Date().toISOString() + ' - ' + level + ': [' + process.pid + '] ' + message );
    
  },
  workers: {
      count: int | 'auto', // int > 0, specifies exact number of workers to use, auto will use one worker per CPU core. default: 2
      restartTimeout: int, // number of milliseconds to wait before restarting a failed worker. default: 1000
      shutdownTimeout: int, // number of milliseconds to wait on app.dinit(done); to call done(null) before the worker is killed. default: 30000
      exitOnException: boolean // if TRUE, a child process will exit on uncaught exception and restart. We HIGHLY recommend only setting this to FALSE for testing default: TRUE 
  }
} );
 
```

## app field

This is is an App class. See the example for structure

## log field

This is a function that will get logging information. Since we are logging outside of your app, and probably outside 
your fancy logging system, we recommend just hitting stderr or some log file. Either, way, its up to you. 

## workers field

### workers.count: default 2

The number of worker processes.
 
Why do we default to two workers? If your process dies due to an uncaught exception, you don't want to take down your
entire server. Having a minimum of two workers prevents this from happening. If you need to scale differently, because
you smartly run a Kubernetes cluster of containers with 1 cpu each, then set this to Auto or 1. 

### workers.restartTimeout: default 1000

If a worker process exits unexpectedly, this is how long in ms we will wait before starting it back up again.

### workers.shutdownTimeout: default 30000

If the daemon is shutting down, this is how long we will wait for the worker to exit. The worker exit time is almost 
entirely dependent on your app.dinit() method calling done(); The daemonix overhead for shutdown handling is << 1ms. 

If it is normal for your application to take 30000ms or longer to shutdown, set this number higher. We recommend it to
be set between 2x and 3x times expected shutdown time.

### workers.restartOnException: default TRUE

This should only be set to FALSE for testing and debugging. NEVER release production code with this set to FALSE. Only
set this to FALSE if you have an uncaught exception firing and you are trying to debug application state without the
process exiting.

# CLI

The deamonix deployment system and CLI tool has been removed. We highly recommend using containers, or services like 
Google's AppEngine to deploy your code. Running physical servers, or even VMs is the way of the past. By removing
support for deployments we can focus on more important things.

The process management will remain the focus of this library. We will continue to support signal handling in every major
nix like system.

Thanks!

Contribute
===

If you want to contribute, feel free to. Fork the repo on GitHub, make a feature branch of the format 'feature/feature-name-here', and get to work!

Some things we don't need:

- Comma first array definitions 
- Omitting braces on code blocks
- CoffeeScript
- Variable version numbers in package.json. Lock them down.
- Back talk. Present your case with logic and you will be heard. Present it with attitude and we will hug you until you cry and hug us back.

When in doubt, format your code like you are writing good ole C and don't be a hipster coder.
