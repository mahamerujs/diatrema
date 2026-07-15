export interface Logger {
    info(...data: any[]): void;
    error(message: string, error?: unknown): void;
    warn(...data: any[]): void;
    debug(...data: any[]): void;
}

export const createLogger = (debug: boolean = false): Logger => {
    return {
        info: (...data: any[]) => {
            if (debug) {
                console.log('[Info]', ...data)

                return
            }
        },
        error: (message, error) => {
            console.error(`[Error] ${message}`, error);
        },
        warn: (...data: any[]) => {
            if (debug) {
                console.warn('[Warn]', ...data)
            }
        },
        debug: (...data: any[]) => {
            if (debug) {
                console.debug('[Debug]', ...data)
            }
        }
    };
};
