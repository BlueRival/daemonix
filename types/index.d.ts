declare module 'daemonix' {
    // Defining interfaces

    interface App {
        init(done: (err?: Error | null) => void): void;

        dinit(done: (err?: Error | null) => void): void;
    }

    // Here typeof AppInterface is used to represent a Class that implements the AppInterface
    type AppClass = new (env: string) => App;

    interface LogFn {
        (level: 'error' | 'info' | 'warning', message: string, meta?: Record<string, unknown>): void;
    }

    interface WorkersOptions {
        count?: number | 'auto';
        restartTimeout?: number;
        shutdownTimeout?: number;
        exitOnException?: boolean;
    }

    interface DaemonixOptions {
        app: AppClass;  // Now App represents a Class type
        log?: LogFn;
        workers?: WorkersOptions;
    }

    const daemonix: (options: DaemonixOptions) => void;
    export = daemonix;
}
