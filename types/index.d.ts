declare module 'daemonix' {
    // Defining interfaces

    export interface App {
        init(done: (err?: Error | null) => void): void;

        dinit(done: (err?: Error | null) => void): void;
    }

    // Here typeof AppInterface is used to represent a Class that implements the AppInterface
    export type AppClass = new (env: string) => App;

    export interface LogFn {
        (level: string, message: string, meta?: Record<string, unknown>): void;
    }

    export interface WorkersOptions {
        count?: number | 'auto';
        restartTimeout?: number;
        shutdownTimeout?: number;
        exitOnException?: boolean;
    }

    export interface DaemonixOptions {
        app: AppClass;  // Now App represents a Class type
        log?: LogFn;
        workers?: WorkersOptions;
    }

    const daemonix: (options: DaemonixOptions) => void;
    export default daemonix;
}
