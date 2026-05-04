declare module 'daemonix' {
  interface App {
    init(done: (err?: Error | null) => void): void;

    init(): Promise<void>;

    dinit(done: (err?: Error | null) => void): void;

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
