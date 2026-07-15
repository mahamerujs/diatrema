export class HttpServerError extends Error {
    public readonly statusCode: number = 500;
    public readonly details?: string;

    constructor(details?: string) {
        super('Internal Server Error');
        this.name = 'HttpServerError';
        this.details = details;

        Object.setPrototypeOf(this, HttpServerError.prototype);

        if (Error.captureStackTrace)
            Error.captureStackTrace(this, HttpServerError);
    }
}
