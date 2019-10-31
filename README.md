# Daemonix

Daemonix is an awesome tool for managing NodeJS processes/clusters as a daemon in Linux/Unix environments. Daemonix 
will:

 * Cluster your code to take advantage of multiple CPUs
 * Manage uncaught exceptions by restarting in a controlled way
 * Handle restarting workers that unexpectedly die or become unresponsive.
 * Work with any CI/CD pattern
 * Work with any process management, whether OS based or home brewed: SystemV, Upstart, PM2, etc.
 * Have no opinion about your code aside from the instantiate, init, dinit life cycle.  

~~No, we will never try to make this work for Windows in any way shape or form.~~ Actually, Daemonix may actually work
on Windows as is. Even through it is targeted at Nix based OSes it appears to work on Windows based on some 3rd party 
feedback we have received. Yay? 

If you want to understand how Daemonix works, see [Deep Dive on Daemonix](#deep-dive-on-daemonix).

## Version 3.x
This is a big re-write to the interface of the Deamonix process management component, and a complete 
removal of the Deamonix CLI tool for deploying processes. See the CLI section below for reasoning behind removing the
CLI tool.

## Table of Contents

* [Basic Usage](#basic-usage)
* [Advanced Usage](#advanced-usage)
* [CLI Removed](#cli-removed)
* [Deep Dive on Daemonix](#deep-dive-on-daemonix)
    * [Life-Cycle](#life-cycle)
    * [Signals Processing](#signals-processing)
* [Contribute](#contribute)

## Basic Usage


The minimum to have Daemonix manage your process is just this in your server.js.

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

See [StringStack](https://www.npmjs.com/package/stringstack) for an awesome framework that generates an App class with 
built-in dependency management. 


## Advanced Usage

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

### app field

This is is an App class. See the example for structure

### log field

This is a function that will get logging information. Since we are logging outside of your app, and probably outside 
your fancy logging system, we recommend just hitting stderr or some log file. Either, way, its up to you. 

### workers field

#### workers.count: default 2

The number of worker processes.
 
Why do we default to two workers? If your process dies due to an uncaught exception, you don't want to take down your
entire server. Having a minimum of two workers prevents this from happening. If you need to scale differently, because
you smartly run a Kubernetes cluster of containers with 1 cpu each, then set this to Auto or 1. 

#### workers.restartTimeout: default 1000

If a worker process exits unexpectedly, this is how long in ms we will wait before starting it back up again.

#### workers.shutdownTimeout: default 30000

If the daemon is shutting down, this is how long we will wait for the worker to exit. The worker exit time is almost 
entirely dependent on your app.dinit() method calling done(); The daemonix overhead for shutdown handling is << 1ms. 

If it is normal for your application to take 30000ms or longer to shutdown, set this number higher. We recommend it to
be set between 2x and 3x times expected shutdown time.

#### workers.restartOnException: default TRUE

This should only be set to FALSE for testing and debugging. NEVER release production code with this set to FALSE. Only
set this to FALSE if you have an uncaught exception firing and you are trying to debug application state without the
process exiting.

## CLI Removed

The deamonix deployment system and CLI tool has been removed. We highly recommend using containers, or services like 
Google's AppEngine to deploy your code. Running physical servers, or even VMs is the way of the past. By removing
support for deployments we can focus on more important things.

The process management will remain the focus of this library. We will continue to support signal handling in every major
nix like system.

Thanks!

## Deep Dive on Daemonix

Daemonix aims to be a very simple interface that does some very important things. In order of most, to least important:

1. Handles start and stop signals from the OS in a consistent, graceful manner.
1. Handles uncaught exceptions with a graceful restart.
1. Handles un-expected process exits with a delay and restart.
1. Handles clustering to utilize multiple CPUs and to help balance memory/CPU consumption.
1. Logs what it is doing to a logging callback supplied by user.

### Life-Cycle

First thing to describe is how Daemonix manages the life cycle of your daemon. We will start at the command prompt in 
this example, but you could be starting your daemon from SystemV, UpStart, or any other process start/stop management
tool in your OS.

* Start your daemon with something like `node server.js`
* Once you call `daemonix( { app: App } )` Daemonix will take over managing the process.
* Daemonix will perform some checks and inspect options passed to `daemonix()`.
* Daemonix will determine if it is running in master mode, or in worker mode. The first process is always master. Only
the master process creates worker processes.
Daemonix will create all of the worker processes.
    * Master Mode
        * Daemonix will see that it started as the master process.
        * Daemonix will determine the number of works needed based on options passed to `daemonix()`. Default for number
        of workers is `auto`, which indicates one worker per CPU core. Note that a single CPU core with Hyper-Threading 
        will only get one worker in `auto` mode. If an exact, positive integer is supplied in options, then that exact
        number of workers will be used regardless of CPU count.
        * Daemonix will create a [Node.JS cluster](https://nodejs.org/docs/latest-v12.x/api/cluster.html) 
        * Daemonix will create the number of workers needed. 
        * Daemonix will keep the correct number of workers running. If a worker exits unexpectedly, or becomes 
        unresponsive, Daemonix will wait a timeout amount of time, and then will kill the existing worker if needed with
        graceful shutdown logic, then start a new worker to replace the failed worker.
        * If a shutdown signal is received from the OS, via Ctrl+C, or a kill command, or any other OS signal for a 
        process to exit, Daemonix will propagate the signal and will trigger a graceful shutdown in each worker. 
        Daemonix will wait for a timeout amount of time for each worker to exit. If a worker does not exit within that
        timeout, Daemonix will force the process to exit. This is a critical step. Depending on how the process was 
        started, and depending on what kind of signal was passed, the signal may propagate by the OS to child worker 
        processes in the cluster, or may just stop at the master process. It is essential that the worker processes are
        started and stopped by the master in a consistent manner to ensure graceful start-up and shutdown occurs. 
        Daemonix handles coordinating these signals and ensures all processes start and stop as expected regardless of 
        the OS or signal used. 
        * Once all workers have exited the master exits
    * Worker Mode
        * Daemonix will see that it is started as a worker process.
        * Daemonix will instantiate an instance of App class passed to `daemonix()`.
        * Daemonix will then call `app.init()`. If init does not call done within the timeout, Daemonix will exit and
        the master process will restart the worker.
        * All code in app runs on its own. The only thing Daemonix is doing is looking for signals from the master 
        process and uncaught exceptions.
        * If an exit signal is received or an uncaught exception is thrown, Daemonix will call `app.dinit()` to shutdown
        the worker process. If dinit takes more than timeout amount of time, Daemonix forcibly kills the process. In the
        event of an uncaught exception, the worker is exiting unexpectedly according to the master process' perspective.
        In this case the master process will create a new worker to replace the worker that exited.

### Signals Processing

In general purpose operating systems the relationship between your code and the operating system looks like this.

```
code
======
process
======
kernel
```

Your code runs inside a process. A process is a data structure used by the operating system to track all the resources 
of your code as it executes. This includes open files, network access, consumed memory, program counter, etc. When you
first start running your code the kernel creates a process, sets the program counter to 0 and starts executing 
instructions. This can be called the start signal, though it isn't technically a signal. 

Stopping a process is more complicated. When a process stops a POSIX signal is passed from the kernel to the process. 
Depending on the type of signal and whether the signal is sent directly to a process, or to a parent process impacts
what the code in the process can do about the signal. Ideally a process would be able to clean up resources and exit on
its own accord. SIGINT and SIGTERM signals can be trapped by code. But when they show up is inconsistent. Depending on a 
number of factors a process could get a single SIGINT, maybe a SIGINT then a SIGTERM, maybe just a SIGTERM, maybe a 
SIGTERM then a SIGINT. Sometimes a SIGINT on parent process propagates to child processes. Sometimes it doesn't. 

The result is that multiple signals from the OS are possible which can result in more, less or the same number of 
signals propagating to child processes. It looks something like this, where pipe (|) is a SIGINT, SIGTERM or SIGKILL
signal.

```
code
=|=|==||==
process
=|===|=|=
kernel
```

An ideal scenario would look like this.

```
code
=|=====
process
=||==|=|=|=
kernel
```

In this scenario all the signals are compressed into a single coherent event. Daemonix implements in code, thus 
it is independent of your OS. Daemonix runs here, with your code, filtering the POSIX signals.

```
code
--|----
daemonix
=|=|==||==
process
=||==|=|=|=
kernel
```


In order to achieve this Daemonix implements the following logic to process signals in the master and worker processes.

#### Master Process

The master process funnels all trappable signal types into a single stream of events. The first signal triggers graceful
shutdown. It doesn't matter if the signal is a SIGINT or SIGTERM. Master process will issue a SIGTERM to each worker 
process and wait for them to shutdown. If they don't shutdown within timeout master process sends a SIGKILL, which 
forces the process to halt immediately. 

If the master gets a second signal from the user after the first is being processed, master will force shutdown workers
and itself. Essentially master will SIGKILL the worker processes and then itself. This is useful for when a process is
hanging on shutdown, perhaps due to an uncaught exception, resource issue like thrashing or some other problem. In these
cases an administrator may simply issue the a second Ctrl+C or issue an OS level signal twice to force a shutdown 
without having to restart the server, which may also hang if the process won't exit. 

A SIGKILL from the OS is a slightly different story. SIGKILL immediately, without any guile or reservation just deletes
the process. There is no chance for the master to catch the signal and propagate it to the worker processes. However, 
all OSes do this automatically. If you send SIGKILL to any process, all POSIX OSes will forcibly kill that process and 
all child processes immediately without prejudice. 

#### Worker Process

Worker processes ignore all signals except SIGTERM. SIGINT can sometimes propagate from the OS or other places and break
the graceful shutdown logic you worked so hard to implement. The solution is that the master process will issue a 
SIGTERM signal to a worker process when it should stop. 

If a user sends a SIGTERM or SIGKILL signal to a worker process, it will shutdown according to that signal type, but the
master will not expect this. The master will recreate the worker after a restart timeout passes. If a user sends a 
SIGINT signal to a worker process it will be ignored always.  

The worker process should only be started/stopped by the master process under normal circumstances. The only time it may
make sense to try and manipulate a child process directly is for unusual debugging situations.

## Contribute

If you want to contribute, feel free to. Fork the repo on GitHub, make a feature branch of the format 
'feature/feature-name-here', and get to work!

Things to do:

- Run `npm test` on each major supported version of node before submitting your code.
- Supported versions of node can be determined by inspecting engines.node in package.json.
- Code style and patterns must conform to standards in .eslintrc.json.
- Code must be awesome!


