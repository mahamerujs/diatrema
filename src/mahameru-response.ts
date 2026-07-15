export class MahameruResponse {
    public body: unknown;
    public status: number;
    public headers: Headers;

    constructor(body: unknown, init?: { status?: number; headers?: Headers | Record<string, string> }) {
        this.body = body;
        this.status = init?.status || 200;

        if (init?.headers instanceof Headers) {
            this.headers = init.headers;
        } else if (typeof init?.headers === 'object' && init.headers !== null && !Array.isArray(init.headers)) {
            init.headers = {
                'Content-Type': 'application/json',
                ...init.headers
            }

            this.headers = new Headers(init.headers);
        } else {
            this.headers = new Headers({
                'Content-Type': 'application/json'
            });
        }
    }

    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        return new MahameruResponse(body, init);
    }

    public setHeader(key: string, value: string) {
        this.headers.set(key, value);
    }

    public setHeaders(headers: Headers | Record<string, string>) {
        if (headers instanceof Headers) {
            headers.forEach((value, key) => {
                this.headers.set(key, value);
            });
        } else if (typeof headers === 'object' && headers !== null && !Array.isArray(headers)) {
            for (const [key, value] of Object.entries(headers)) {
                this.headers.set(key, value);
            }
        }
    }
}
