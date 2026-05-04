declare module 'daemonix' {
  export interface App {
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

  // AppClass represents a class constructor that produces an App instance
  export type AppClass = new (env: string) => App;

  export type LogLevel = 'error' | 'info' | 'warning';

  export type LogMeta = string | number | boolean | object | null | undefined;

  export interface Logger {
    (level: LogLevel, message: string, meta?: LogMeta): void;
  }

  export interface WorkersOptions {
    count?: number | 'auto';
    restartTimeout?: number;
    shutdownTimeout?: number;
    exitOnException?: boolean;
  }

  export interface Options {
    app: AppClass;
    log?: Logger;
    workers?: WorkersOptions;
  }

  export function daemonix(options: Options): void;

  export default function daemonix(options: Options): void;
}
