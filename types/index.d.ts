declare module 'daemonix' {
    interface App {
        new(env: string): App;

        init(done: (err?: Error | null) => void): void;

        dinit(done: (err?: Error | null) => void): void;
    }

    interface LogFn {
        (level: string, message: string, meta?: Record<string, unknown>): void;
    }

    interface WorkersOptions {
        count: number | 'auto';
        restartTimeout: number;
        shutdownTimeout: number;
        exitOnException: boolean;
    }

    export function daemonix(options: {
        app: App;
        log: LogFn;
        workers: WorkersOptions;
    }): void;
}