declare module 'daemonix' {
  interface App {
    /**
     * Initialize the application using a Node-style callback.
     * Call `done(err)` when finished. Returns void.
     */
    init(done: (err?: Error | null) => void): void;
    /**
     * Initialize the application using a Promise.
     * Takes no arguments and returns a Promise that resolves when finished.
     * @throws {Error} The returned Promise may reject with an Error.
     */
    init(): Promise<void>;

    /**
     * De-initialize / shut down the application using a Node-style callback.
     * Call `done(err)` when finished. Returns void.
     */
    dinit(done: (err?: Error | null) => void): void;
    /**
     * De-initialize / shut down the application using a Promise.
     * Takes no arguments and returns a Promise that resolves when finished.
     * @throws {Error} The returned Promise may reject with an Error.
     */
    dinit(): Promise<void>;
  }

  // App represents a class constructor that produces an App instance
  type AppClass = new (env: string) => App;

  interface LogFn {
    (
      level: 'error' | 'info' | 'warning',
      message: string,
      meta?: Record<string, unknown>,
    ): void;
  }

  interface WorkersOptions {
    count?: number | 'auto';
    restartTimeout?: number;
    shutdownTimeout?: number;
    exitOnException?: boolean;
  }

  interface DaemonixOptions {
    app: AppClass;
    log?: LogFn;
    workers?: WorkersOptions;
  }

  function daemonix(options: DaemonixOptions): void;

  namespace daemonix {
    export { App };
  }

  export = daemonix;
}
