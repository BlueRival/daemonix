# Daemonix

Daemonix is an awesome tool for managing NodeJS processes/clusters as a daemon in Linux/Unix environments. Daemonix
will:

- Cluster your code to take advantage of multiple CPUs
- Manage uncaught exceptions by restarting in a controlled way
- Handle restarting workers that unexpectedly die or become unresponsive.
- Work with any CI/CD pattern
- Work with any process management, whether OS based or home brewed: SystemV, Upstart, PM2, etc.
- Have no opinion about your code aside from the instantiate, init, dinit life cycle.

No, we will never try to make this work for Windows in any way shape or form. It may or may not work for Windows as is,
and we don't care. ;-)

If you want to understand how Daemonix works, see [Deep Dive on Daemonix](#deep-dive-on-daemonix).

## Version 3.x

This is a big re-write to the interface of the Deamonix process management component, and a complete
removal of the Deamonix CLI tool for deploying processes. See the CLI section below for reasoning behind removing the
CLI tool.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
- [Comparison](#comparison)
  - [Feature Matrix](#feature-matrix)
  - [Why not PM2?](#why-not-pm2)
  - [Why not forever?](#why-not-forever)
  - [Why not naught?](#why-not-naught)
  - [Why not nodemon?](#why-not-nodemon)
  - [Why not the native `cluster` module?](#why-not-the-native-cluster-module)
  - [Why not just systemd, Docker, or Kubernetes?](#why-not-just-systemd-docker-or-kubernetes)
  - [Design Principles](#design-principles)
- [CLI Removed](#cli-removed)
- [Deep Dive on Daemonix](#deep-dive-on-daemonix)
  - [Life-Cycle](#life-cycle)
  - [Signals Processing](#signals-processing)
- [Contribute](#contribute)

## Basic Usage

The minimum to have Daemonix manage your process is to define an `App` class with optional `constructor()` and required
`init()` and `dinit()` methods, then hand that class to `daemonix()` to start running the process. The class is
only instantiated in worker processes — never in the main/cluster process. `init()` runs at worker start-up; `dinit()`
runs at graceful shutdown.

`init()` must not return until the app is 100% online and ready to accept requests and work.
`dinit()` must not return until the app is 100% ready for the process to exit.

`init()` and `dinit()` each accept exactly one of two forms — pick one, don't mix:

- **Promise form:** no parameters, returns `Promise<void>` (may reject with an `Error`).
- **Callback form:** accepts a single Node-style callback `done(err?: Error | null) => void` and returns `void`. Call
  `done()` (or `done(err)` on failure) when finished.

In TypeScript, `import { App }` from `daemonix` and `implements App` on your class so the IDE/linter knows `init()` and
`dinit()` are the entry points called by Daemonix.

TypeScript:

```typescript
import { daemonix, App, Options } from 'daemonix';

class MyApp implements App {
  constructor(env: string) {
    // env is the NODE_ENV-style environment string passed by Daemonix
  }

  async init(): Promise<void> {
    // graceful startup
  }

  async dinit(): Promise<void> {
    // graceful shutdown
  }
}

const options: Options = { app: MyApp };

daemonix(options);
```

JavaScript:

```javascript
const daemonix = require('daemonix');

class MyApp {
  constructor() {}

  async init() {
    // graceful startup
  }

  async dinit() {
    // graceful shutdown
  }
}

daemonix({ app: MyApp });
```

With this code, Daemonix will automatically spin up a minimum of two worker processes, and manage the worker's presence.
If the workers die for any reason, Daemonix will restart it. This minimizes, and even removes, the need for utilities
like
`forever`. If the system has more than 2 CPU cores, Daemonix will create one worker process for each CPU core.

If any worker dies, it will be restarted in 1000 ms. If the main process exits, then it will give each worker up to
30000 ms to return from `dinit()`.

## Advanced Usage

Pass additional fields to `daemonix()` to customize logging and worker behavior. The shape is the same regardless of
language; only the import/syntax differs.

TypeScript:

```typescript
import { daemonix, App, Options, Logger, WorkersOptions } from 'daemonix';

class MyApp implements App {
  constructor(env: string) {
    // env is provided by Daemonix
  }

  async init(): Promise<void> {
    // startup your code
  }

  async dinit(): Promise<void> {
    // shutdown your code
  }
}

const log: Logger = (level, message, meta) => {
  // level is 'error' | 'info' | 'warning'
  // message is always a string
  // meta can be an Error or some other simple JSON object
};

const workers: WorkersOptions = {
  count: 'auto', // number > 0, or 'auto'. 'auto' uses one worker per CPU core with a minimum of 2 workers. default: 1 worker
  restartTimeout: 1000, // number of milliseconds to wait before restarting a failed worker. default: 1000
  shutdownTimeout: 30000, // number of milliseconds to wait on app.dinit() to return before the worker is killed. default: 30000
  exitOnException: true, // if TRUE, a child process will exit on uncaught exception and restart. We HIGHLY recommend only setting this to FALSE for testing. default: TRUE
};

const options: Options = {
  app: MyApp,
  log,
  workers,
};

daemonix(options);
```

JavaScript:

```javascript
const daemonix = require('daemonix');

class MyApp {
  async init() {
    // startup your code
  }

  async dinit() {
    // shutdown your code
  }
}

daemonix({
  app: MyApp,
  log: function (level, message, meta) {
    // level can be 'error' | 'info' | 'warning'
    // message will always be a string
    // meta can be an Error or some other simple JSON object
  },
  workers: {
    count: 'auto', // number > 0, or 'auto'. 'auto' uses one worker per CPU core with a minimum of 2 workers. default: 1 worker
    restartTimeout: 1000, // number of milliseconds to wait before restarting a failed worker. default: 1000
    shutdownTimeout: 30000, // number of milliseconds to wait on app.dinit() to return before the worker is killed. default: 30000
    exitOnException: true, // if TRUE, a child process will exit on uncaught exception and restart. We HIGHLY recommend only setting this to FALSE for testing. default: TRUE
  },
});
```

### app field

This is an App class as described above in the examples. See the example for structure.

### log field

This is a function that will get logging information. Since we are logging outside your app, and probably outside
your fancy logging system, we recommend just hitting stderr or some log file. Either, way, it's up to you.

### workers field

#### workers.count: default 1

The number of worker processes.

Why do we default to two workers on auto even if the system only has 1 CPU? If your process dies due to an uncaught
exception, you don't want to take down your entire server. Having a minimum of two workers prevents this from happening.
If you need to scale differently, you can set this dynamically in your bootstrap file.

#### workers.restartTimeout: default 1000

If a worker process exits unexpectedly, this is how long in ms we will wait before starting it back up again.

#### workers.shutdownTimeout: default 30000

If the daemon is shutting down, this is how long we will wait for the worker to exit. The worker exit time is almost
entirely dependent on your app.dinit() method returning; The daemonix overhead for shutdown handling is << 1ms.

If it is normal for your application to take 30000ms or longer to shutdown, set this number higher. We recommend it to
be set between 2x and 3x times expected shutdown time.

#### workers.restartOnException: default TRUE

This should only be set to FALSE for testing and debugging. NEVER release production code with this set to FALSE. Only
set this to FALSE if you have an uncaught exception firing and you are trying to debug application state without the
process exiting.

## Comparison

There are a lot of ways to keep a Node.js process alive. Daemonix is intentionally **not** trying to be most of
them. This section is an honest comparison with the tools people most commonly reach for, and why we believe
Daemonix is a better fit for modern, cloud-native, [12-factor](https://12factor.net) Node.js services.

The short version: Daemonix is a **library** that does **one thing well** — it turns your `App` class into a
well-behaved POSIX process tree with clustering, graceful shutdown, and crash recovery. It does not deploy your
code, monitor your code, watch your files, rotate your logs, manage your env vars, or pretend to be an init
system. Your container orchestrator, your CI/CD, and your OS already do those things, and they do them better.

**The intended combination is Daemonix _plus_ an execution system** (systemd, Docker, Kubernetes, ECS, Nomad,
Cloud Run, App Engine, etc.). Daemonix manages the daemon from the process inward — clustering, signal
coherence, graceful `dinit()`, crash recovery. The execution system manages the daemon from the process
outward — knowing when to start it on boot, restarting the host or container, draining traffic, scaling, and
stopping it on shutdown. Neither layer should try to do the other's job. The feature matrix below has a column
for that combination, and it is the column you should be aiming for.

### Feature Matrix

Legend: ✅ first-class · ⚠️ partial / awkward · ❌ not supported · ➖ explicitly out of scope (good thing)

| Concern                                                   | **Daemonix** | **Daemonix + orchestrator** | PM2         | forever | naught | nodemon | native `cluster` | systemd / Docker / k8s _alone_ |
| --------------------------------------------------------- | ------------ | --------------------------- | ----------- | ------- | ------ | ------- | ---------------- | ------------------------------ |
| Pure library (no global install, no daemon binary)        | ✅           | ✅                          | ❌          | ❌      | ❌     | ❌      | ✅               | ❌                             |
| Single, narrow responsibility (SRP)                       | ✅           | ✅                          | ❌          | ⚠️      | ⚠️     | ⚠️      | ✅               | ✅                             |
| Multi-CPU clustering with auto worker count               | ✅           | ✅                          | ✅          | ❌      | ✅     | ❌      | ⚠️ (manual)      | ❌                             |
| Coherent POSIX signal handling (SIGINT/SIGTERM funneled)  | ✅           | ✅                          | ⚠️          | ❌      | ⚠️     | ❌      | ❌               | ⚠️                             |
| Graceful shutdown lifecycle (`init` / `dinit`)            | ✅           | ✅                          | ⚠️ (events) | ❌      | ⚠️     | ❌      | ❌               | ❌                             |
| Bounded shutdown timeout with forced kill                 | ✅           | ✅                          | ✅          | ❌      | ⚠️     | ❌      | ❌               | ✅                             |
| Restart on uncaught exception (controlled)                | ✅           | ✅                          | ✅          | ✅      | ✅     | ⚠️      | ❌               | ⚠️ (whole container)           |
| Auto start/stop with the server, container, or cluster    | ❌           | ✅                          | ⚠️          | ❌      | ❌     | ❌      | ❌               | ✅                             |
| 12-factor logs to stdout/stderr (no log files)            | ✅           | ✅                          | ❌ (own)    | ❌      | ⚠️     | ⚠️      | ✅               | ✅                             |
| 12-factor config from the environment                     | ✅           | ✅                          | ⚠️ (JSON)   | ⚠️      | ⚠️     | ⚠️      | ✅               | ✅                             |
| No PID files, no state on disk                            | ✅           | ✅                          | ❌          | ❌      | ❌     | ❌      | ✅               | ✅                             |
| Container-native (PID 1 friendly, no double supervisor)   | ✅           | ✅                          | ❌          | ❌      | ⚠️     | ❌      | ✅               | ✅                             |
| Works under any orchestrator (k8s, ECS, Nomad, Cloud Run) | ✅           | ✅                          | ⚠️          | ⚠️      | ⚠️     | ❌      | ✅               | n/a                            |
| Tiny dependency footprint                                 | ✅ (2 deps)  | ✅ (2 deps)                 | ❌ (large)  | ⚠️      | ⚠️     | ⚠️      | ✅               | n/a                            |
| TypeScript types shipped                                  | ✅           | ✅                          | ⚠️          | ❌      | ❌     | ⚠️      | ✅ (via @types)  | n/a                            |
| Bundles a deploy / monitoring / log-rotation product      | ➖           | ➖                          | ✅ (PM2+)   | ❌      | ❌     | ❌      | ➖               | ➖                             |
| File-watching / dev reload                                | ➖           | ➖                          | ✅          | ✅      | ❌     | ✅      | ❌               | ❌                             |
| Windows support                                           | ➖           | ➖                          | ✅          | ✅      | ❌     | ✅      | ✅               | ⚠️                             |

The rows marked ➖ for Daemonix are **deliberate non-goals**. We treat the absence of those features as a feature.

A few notes on how to read the matrix:

- **Daemonix** by itself does not know how to start your service when the machine boots, or how to stop it
  cleanly when the machine shuts down. That is a job for the OS / orchestrator. So Daemonix gets a ❌ on the
  "auto start/stop with the server, container, or cluster" row, on purpose.
- **Daemonix + orchestrator** is the intended deployment shape. The orchestrator handles boot, host failure,
  scaling, and shutdown lifecycle; Daemonix handles in-process clustering, signal coherence, and graceful
  `dinit()`. Together they cover every row.
- The **systemd / Docker / k8s _alone_** column specifically describes the case where you try to use those
  tools _without_ Daemonix or any other in-process supervisor. The orchestrator can keep _a_ process alive,
  but it has no way to cluster a single Node.js process across CPU cores, no way to call your `dinit()`
  before SIGKILL, and no way to coalesce noisy POSIX signals into one clean shutdown event.

### Why not PM2?

PM2 is the most common alternative, and it does a lot. That is exactly the problem.

- **It is its own daemon.** PM2 runs a long-lived `God` process and a CLI that talks to it over an IPC socket. In
  a container or under systemd, that means you are running a process supervisor inside a process supervisor. The
  outer supervisor (Docker, Kubernetes, systemd) cannot see your real workers, only PM2. Health checks, OOM
  signals, and lifecycle events get muddled.
- **It violates the [12-factor](https://12factor.net) "logs as event streams" rule.** PM2 captures your stdout
  and stderr, writes them to its own files in `~/.pm2/logs`, and then expects you to use `pm2 logs` and
  `pm2-logrotate` to read them. In a container, you want the kernel-level stdout stream so that
  `kubectl logs`, Cloud Logging, Datadog, etc. just work.
- **It bundles deploy, monitoring, ecosystem files, keymetrics, cluster mode, log rotation, startup scripts,
  and more.** This is the opposite of the [Single Responsibility Principle](https://en.wikipedia.org/wiki/SOLID).
  When any one of those features misbehaves, your process management is at risk too.
- **State on disk.** PID files, dump files, module store. None of that survives a container restart and none of
  it should be needed if your orchestrator is doing its job.
- **Heavy dependency surface.** Every transitive dependency is a supply-chain risk in a process that is, by
  definition, the parent of your production code.

Daemonix is a `require()` call. It has no daemon, no socket, no CLI, no state directory, and two runtime
dependencies. Your orchestrator stays in charge.

### Why not forever?

`forever` solves the original problem: "my Node script crashed and I want it to come back." It does not solve
the modern problem of running clustered, graceful, container-native services.

- No clustering, no graceful shutdown contract, no signal funneling.
- Maintains a global state directory (`~/.forever`) and PID files.
- Designed to be run from a CLI on a long-lived VM. It has no real story for containers, where the orchestrator
  is the thing that should restart you.
- Effectively unmaintained.

If you are using `forever` today, your container runtime or systemd unit can already do "restart on exit"
natively, and Daemonix layers clustering and graceful shutdown on top of that without adding a second
supervisor.

### Why not naught?

`naught` was a clever idea — zero-downtime deploys via cluster worker swapping. In practice:

- It is unmaintained.
- It is a CLI / daemon, not a library, and so it has the same "supervisor inside a supervisor" problem as PM2.
- Zero-downtime deploys are now the orchestrator's job (rolling updates in Kubernetes, blue/green in ECS,
  traffic splitting in Cloud Run / App Engine). Solving it inside the Node process is the wrong layer.

Daemonix focuses on the part of the problem that _must_ live inside the Node process — POSIX signal coherence,
clustering, lifecycle — and leaves deployment strategy to the platform that owns deployment.

### Why not nodemon?

`nodemon` is a development tool. It restarts your process when files change. That is not what Daemonix is for,
and it is not what you want in production. The two tools are complementary:

- Use `nodemon` (or `tsx watch`, etc.) in development.
- Use Daemonix in every environment, including development, to get the same lifecycle behavior locally that you
  get in production. (Dev/prod parity is [factor X](https://12factor.net/dev-prod-parity) of 12-factor.)

### Why not the native `cluster` module?

If you are not going to use Daemonix, the native `node:cluster` module is honestly the next best option, and
the matrix reflects that. It is built in, has zero supply-chain surface, and stays out of the orchestrator's
way. Daemonix is, at its core, a careful wrapper around `cluster` plus signal handling — so anything
`cluster` does well, Daemonix inherits.

The reason Daemonix exists at all is that every team that builds directly on `cluster` ends up rewriting the
same code:

- A loop that respawns dead workers with a backoff.
- Code to track which signal has already been handled, so a double Ctrl-C force-kills.
- A timeout that escalates SIGTERM to SIGKILL.
- A worker-side handler that ignores SIGINT, traps SIGTERM, runs cleanup, and exits.
- A way to call your app's startup and shutdown hooks deterministically.

That code is hard to get right (see [Signals Processing](#signals-processing) below for why). Daemonix is the
shared, tested implementation of exactly that code, and nothing else.

### Why not just systemd, Docker, or Kubernetes?

This subsection is specifically about the case of using systemd, Docker, or Kubernetes _alone_ — that is,
trying to solve all of the Node.js process-management concerns with the orchestrator and nothing else, no
Daemonix and no other in-process supervisor. That is the column labeled "systemd / Docker / k8s _alone_" in
the matrix above.

You should absolutely use one of those tools. Daemonix is designed to live _inside_ a container or systemd
unit, not to replace it; the **intended combination is Daemonix + orchestrator**. The orchestrator handles:

- Restarting the process if it exits.
- Sending SIGTERM on shutdown and SIGKILL after a grace period.
- Health checks, rolling updates, scaling, log collection, secrets, env vars.

What the orchestrator **cannot** do is:

- Cluster a single Node.js process across multiple CPU cores within one container. (You would otherwise need to
  run N containers per host to use N cores, multiplying overhead.)
- Give your application code a deterministic `dinit()` callback that runs _before_ the SIGKILL grace period
  expires.
- Compress the noisy, OS-dependent stream of POSIX signals into a single, coherent shutdown event so your code
  can drain connections cleanly.

Daemonix fills exactly that gap, and only that gap.

### Design Principles

These are the rules Daemonix holds itself to. They are why the feature matrix above looks the way it does.

- **Single Responsibility.** Daemonix manages a Node.js process tree. It does not deploy code, watch files,
  rotate logs, ship metrics, or expose a dashboard. Each of those is a separate concern with a better tool.
- **Library, not framework.** You call Daemonix; Daemonix does not call you, except through the small `App`
  contract (`constructor`, `init`, `dinit`). No magic, no globals, no plugin system, no config file format to
  learn.
- **12-factor by default.** Logs go to a callback you control (write to stdout). Config comes from your code
  and the environment. There are no PID files, no log files, no state directory. Processes are disposable —
  fast startup, graceful shutdown.
- **Cloud-native and container-friendly.** Daemonix expects to be PID 1's child (or PID 1 itself) inside a
  container. It cooperates with the orchestrator's signals instead of fighting them. There is no second
  supervisor.
- **Open/Closed.** The `App` interface is the extension point. You bring your code; Daemonix doesn't grow new
  surface area to "support" your framework.
- **Dependency Inversion.** Daemonix depends on the `App` contract and on POSIX, not on your stack. It works
  the same with Express, Fastify, Koa, gRPC, raw TCP, queue consumers, or batch workers.
- **Small surface, small dependency tree.** Two runtime dependencies. The smaller the supervisor, the smaller
  the blast radius when something goes wrong.
- **Portability over features.** Any modern Linux/Unix, any orchestrator, any CI/CD, any logging backend.
  Daemonix has no opinion about how you ship code or where it runs.
- **Do one thing well.** If a feature can live outside Daemonix, it does.

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

- Start your daemon with something like `node server.js`
- Once you call `daemonix( { app: App } )` Daemonix will take over managing the process.
- Daemonix will perform some checks and inspect options passed to `daemonix()`.
- Daemonix will determine if it is running in master mode, or in worker mode. The first process is always master. Only
  the master process creates worker processes.
  Daemonix will create all of the worker processes.
  - Master Mode
    - Daemonix will see that it started as the master process.
    - Daemonix will determine the number of works needed based on options passed to `daemonix()`. Default for number
      of workers is `auto`, which indicates one worker per CPU core. Note that a single CPU core with
      Hyper-Threading
      will only get one worker in `auto` mode. If an exact, positive integer is supplied in options, then that exact
      number of workers will be used regardless of CPU count.
    - Daemonix will create a [Node.JS cluster](https://nodejs.org/docs/latest-v12.x/api/cluster.html)
    - Daemonix will create the number of workers needed.
    - Daemonix will keep the correct number of workers running. If a worker exits unexpectedly, or becomes
      unresponsive, Daemonix will wait a timeout amount of time, and then will kill the existing worker if needed
      with
      graceful shutdown logic, then start a new worker to replace the failed worker.
    - If a shutdown signal is received from the OS, via Ctrl+C, or a kill command, or any other OS signal for a
      process to exit, Daemonix will propagate the signal and will trigger a graceful shutdown in each worker.
      Daemonix will wait for a timeout amount of time for each worker to exit. If a worker does not exit within that
      timeout, Daemonix will force the process to exit. This is a critical step. Depending on how the process was
      started, and depending on what kind of signal was passed, the signal may propagate by the OS to child worker
      processes in the cluster, or may just stop at the master process. It is essential that the worker processes
      are
      started and stopped by the master in a consistent manner to ensure graceful start-up and shutdown occurs.
      Daemonix handles coordinating these signals and ensures all processes start and stop as expected regardless of
      the OS or signal used.
    - Once all workers have exited the master exits
  - Worker Mode
    - Daemonix will see that it is started as a worker process.
    - Daemonix will instantiate an instance of App class passed to `daemonix()`.
    - Daemonix will then call `app.init()`. If init does not return within the timeout, Daemonix will exit and
      the master process will restart the worker.
    - All code in app runs on its own. The only thing Daemonix is doing is looking for signals from the master
      process and uncaught exceptions.
    - If an exit signal is received or an uncaught exception is thrown, Daemonix will call `app.dinit()` to shutdown
      the worker process. If dinit takes more than timeout amount of time, Daemonix forcibly kills the process. In
      the
      event of an uncaught exception, the worker is exiting unexpectedly according to the master process'
      perspective.
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

#### Main Process

The master process funnels all trappable signal types into a single stream of events. The first signal triggers graceful
shutdown. It doesn't matter if the signal is a SIGINT or SIGTERM. Master process will issue a SIGTERM to each worker
process and wait for them to shut down. If they don't shut down within timeout master process sends a SIGKILL, which
forces the process to halt immediately.

If the master gets a second signal from the user after the first is being processed, master will force shutdown workers
and itself. Essentially master will SIGKILL the worker processes and then itself. This is useful for when a process is
hanging on shutdown, perhaps due to an uncaught exception, resource issue like thrashing or some other problem. In these
cases an administrator may simply issue a second Ctrl+C or issue an OS level signal twice to force a shutdown
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
