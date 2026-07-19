export interface Logger {
    info(...data: any[]): void;
    error(message: string, error?: unknown): void;
    warn(...data: any[]): void;
    debug(...data: any[]): void;
}

export const createLogger = (name: string | string[], debug: boolean = false): Logger => {
    if (typeof name === 'string') {
        name = [`[${name}]`];
    } else {
        name = name.map(item => `[${item}]`);
    }
    return {
        info: (...data: any[]) => {
            if (debug) {
                console.log(...name, '[Info]', ...data)

                return
            }
        },
        error: (message, error) => {
            console.error(...name, `[Error] ${message}`, error);
        },
        warn: (...data: any[]) => {
            if (debug) {
                console.warn(...name, '[Warn]', ...data)
            }
        },
        debug: (...data: any[]) => {
            if (debug) {
                console.debug(...name, '[Debug]', ...data)
            }
        }
    };
};
