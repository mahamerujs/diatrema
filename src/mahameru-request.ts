import type { IncomingMessage, IncomingHttpHeaders } from "node:http";
import type { HTTPMethod } from "./types";

export class MahameruRequest {
    public method: HTTPMethod;
    public url: string;
    public headers: IncomingHttpHeaders;
    public query: URLSearchParams;
    public path: string;
    public ipAddress?: string;
    /**
     * Parsed Authorization Bearer header
     * @returns {string | undefined}
     */
    public authorization?: string;
    protected rawRequest: IncomingMessage;

    constructor(request: IncomingMessage) {
        this.rawRequest = request;
        this.method = request.method as HTTPMethod || 'GET';
        this.url = request.url || '/';
        const queryIndex = this.url.indexOf('?');
        const rawPath = queryIndex >= 0 ? this.url.substring(0, queryIndex) : this.url;
        const rawSearch = queryIndex >= 0 ? this.url.substring(queryIndex) : '';
        this.path = rawPath.replace(/\/+/g, '/');
        const parsedUrl = new URL(this.path + rawSearch, `http://${request.headers.host || 'localhost'}`);
        this.query = parsedUrl.searchParams;
        this.ipAddress = request.socket.remoteAddress;
        this.headers = request.headers;

        if (request.headers.authorization) {
            const splitted = request.headers.authorization.split(' ');
            this.authorization = splitted[0].toLowerCase() === 'bearer' ? splitted[1] : undefined;
        }
    }

    async json(): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            this.rawRequest.on('data', (chunk) => { body += chunk.toString(); });
            this.rawRequest.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (err) {
                    reject(new Error('Invalid JSON Body'));
                }
            });
            this.rawRequest.on('error', (err) => reject(err));
        });
    }
}
