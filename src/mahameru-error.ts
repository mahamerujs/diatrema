export class MahameruError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MahameruError';
        this.message = message;

        Object.setPrototypeOf(this, MahameruError.prototype);

        if (Error.captureStackTrace)
            Error.captureStackTrace(this, MahameruError);
    }
}
