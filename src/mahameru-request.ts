import type { IncomingMessage, IncomingHttpHeaders } from "node:http";
import type { HTTPMethod } from "./types";

export interface ParsedUserAgent {
    /** The raw User-Agent header string. */
    raw: string;
    /** The name of the browser (e.g., 'Chrome', 'Safari', 'Firefox', 'Edge', or 'Unknown'). */
    browser: string;
    /** The operating system (e.g., 'Windows', 'macOS', 'iOS', 'Android', 'Linux', or 'Unknown'). */
    os: string;
    /** Detected device type ('mobile', 'tablet', or 'desktop'). */
    device: 'mobile' | 'tablet' | 'desktop';
    /** Whether the request is initiated by a known search engine bot or crawler. */
    isBot: boolean;
}

export interface ParsedFile {
    /** The form field name associated with the file (e.g., 'avatar', 'video'). */
    fieldName: string;
    /** The original filename of the uploaded file (e.g., 'document.pdf'). */
    filename: string;
    /** The MIME type of the file (e.g., 'image/png', 'video/mp4'). */
    mimeType: string;
    /** Binary data of the file stored in memory as a Node.js Buffer. */
    data: Buffer;
    /** File size in bytes. */
    size: number;
}

/**
 * Custom HTTP Request wrapper for the Mahameru framework.
 * Provides safe body parsing, lazy cookie extraction, and helper properties 
 * for modern web application needs.
 */
export class MahameruRequest {
    /** The HTTP method used for this request. */
    public method: HTTPMethod;
    /** The full raw request URL (including search query parameters). */
    public url: string;
    /** Object containing all incoming HTTP request headers. */
    public headers: IncomingHttpHeaders;
    /** Parsed search/query parameters as a `URLSearchParams` object. */
    public query: URLSearchParams;
    /** Cleaned pathname of the request URL (guaranteed to have single forward slashes). */
    public path: string;
    /** The actual client IP address, safely resolving through trusted proxy headers when applicable. */
    public ipAddress?: string;
    public ipAddresses?: string[];
    /** Parsed authorization credentials from the HTTP Authorization Bearer token header. */
    public authorization?: string;
    /** Internal cache to hold parsed user agent to allow multiple read attempts. */
    private _userAgent?: ParsedUserAgent;
    /** Internal cache to hold parsed files from multipart requests. */
    protected _cachedFiles?: ParsedFile[];
    /** Internal cache to hold parsed text fields from multipart requests. */
    protected _cachedMultipartFields?: Record<string, string>;

    /** Internal cache to hold parsed body formats to allow multiple read attempts. */
    protected _cachedText?: string;
    protected _cachedJson?: any;
    protected _cachedFormData?: URLSearchParams;

    /** Raw Node.js HTTP Incoming Message stream. */
    protected rawRequest: IncomingMessage;

    /** Internal placeholder for parsed cookies. */
    private _cookies?: Record<string, string>;

    /**
     * Initializes a new `MahameruRequest` instance from a Node.js `IncomingMessage`.
     */
    constructor(request: IncomingMessage) {
        this.rawRequest = request;
        this.method = (request.method as HTTPMethod) || 'GET';
        this.url = request.url || '/';
        this.headers = request.headers;

        const [rawPath, rawSearch] = this.url.split('?');
        this.path = rawPath.replace(/\/+/g, '/');

        const host = request.headers.host || 'localhost';
        const protocol = this.secure ? 'https' : 'http';
        const parsedUrl = new URL(this.path + (rawSearch ? `?${rawSearch}` : ''), `${protocol}://${host}`);

        const ipResult = this.resolveClientIp(request);

        this.query = parsedUrl.searchParams;
        this.ipAddress = ipResult?.[0];
        this.ipAddresses = typeof ipResult !== 'undefined' ? ipResult : undefined;

        if (request.headers.authorization) {
            const parts = request.headers.authorization.split(' ');
            if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                this.authorization = parts[1];
            }
        }
    }

    /**
     * Helper to safely fetch any HTTP header in a case-insensitive manner.
     */
    public getHeader(headerName: string): string | string[] | undefined {
        return this.headers[headerName.toLowerCase()];
    }

    /**
     * Detects if the connection protocol is encrypted via SSL/TLS.
     */
    public get secure(): boolean {
        const xForwardedProto = this.getHeader('x-forwarded-proto');
        if (typeof xForwardedProto === 'string') {
            return xForwardedProto.toLowerCase() === 'https';
        }

        const socket = this.rawRequest.socket as any;
        return !!(socket.encrypted || (socket.pair && socket.pair.ssl));
    }

    /**
     * Returns the active protocol scheme ('http' or 'https').
     */
    public get protocol(): 'http' | 'https' {
        return this.secure ? 'https' : 'http';
    }

    /**
     * Detects whether this is an AJAX request initiated by client-side scripts (e.g. Fetch API/Axios).
     */
    public get xhr(): boolean {
        const requestedWith = this.getHeader('x-requested-with');
        return typeof requestedWith === 'string' && requestedWith.toLowerCase() === 'xmlhttprequest';
    }

    /**
     * Lazy-loaded HTTP Cookies parsed into a clean key-value object.
     * Only processes the cookie header string when this property is first accessed.
     */
    public get cookies(): Record<string, string> {
        if (this._cookies) return this._cookies;

        const cookieHeader = this.getHeader('cookie');
        const parsedCookies: Record<string, string> = {};

        if (typeof cookieHeader === 'string' && cookieHeader.trim() !== '') {
            const items = cookieHeader.split(';');
            for (const item of items) {
                const parts = item.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    parsedCookies[key] = decodeURIComponent(value);
                }
            }
        }

        this._cookies = parsedCookies;
        return this._cookies;
    }

    /**
     * Lazy-loaded User-Agent parser.
     * Extracts browser name, operating system, device type, and bot status 
     * from the incoming request's `User-Agent` header.
     */
    public get userAgent(): ParsedUserAgent {
        if (this._userAgent) return this._userAgent;

        const rawUA = (this.getHeader('user-agent') as string) || '';
        const ua = rawUA.toLowerCase();

        let os = 'Unknown';

        if (ua.includes('windows')) {
            os = 'Windows';
        } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
            os = (ua.includes('ipad') || (ua.includes('macintosh') && 'maxTouchPoints' in globalThis)) ? 'iOS' : 'macOS';
        } else if (ua.includes('android')) {
            os = 'Android';
        } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
            os = 'iOS';
        } else if (ua.includes('linux')) {
            os = 'Linux';
        }

        let browser = 'Unknown';

        if (ua.includes('edg/')) {
            browser = 'Edge';
        } else if (ua.includes('chrome') || ua.includes('crios')) {
            if (ua.includes('opr/') || ua.includes('opera')) {
                browser = 'Opera';
            } else {
                browser = 'Chrome';
            }
        } else if (ua.includes('firefox') || ua.includes('fxios')) {
            browser = 'Firefox';
        } else if (ua.includes('safari') && !ua.includes('chrome')) {
            browser = 'Safari';
        }

        let device: 'mobile' | 'tablet' | 'desktop' = 'desktop';

        if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) {
            device = 'tablet';
        } else if (ua.includes('iphone') || ua.includes('ipod') || ua.includes('mobile') || ua.includes('android')) {
            device = 'mobile';
        }

        const isBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(rawUA);

        this._userAgent = {
            raw: rawUA,
            browser,
            os,
            device,
            isBot
        };

        return this._userAgent;
    }

    /**
     * Consumes the stream and returns the raw string body payload.
     * Enforces a configurable safe limit to prevent memory-exhaustion DoS attacks.
     * 
     * @param options Custom limits for reading the body stream.
     * @param options.limit Maximum size in bytes allowed for this payload. Defaults to 1MB (1,048,576 bytes).
     * @throws {Error} If the stream body size exceeds the designated limit.
     */
    public async text(options?: { limit?: number }): Promise<string> {
        if (this._cachedText !== undefined) {
            return this._cachedText;
        }

        const limit = options?.limit ?? 1024 * 1024;

        this._cachedText = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;

            const onData = (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > limit) {
                    cleanup();
                    reject(new Error(`Payload Too Large: Content size exceeded limit of ${limit} bytes`));
                    return;
                }
                chunks.push(chunk);
            };

            const onEnd = () => {
                cleanup();

                resolve(Buffer.concat(chunks).toString('utf8'));
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const cleanup = () => {
                this.rawRequest.off('data', onData);
                this.rawRequest.off('end', onEnd);
                this.rawRequest.off('error', onError);
            };

            this.rawRequest.on('data', onData);
            this.rawRequest.on('end', onEnd);
            this.rawRequest.on('error', onError);
        });

        return this._cachedText;
    }

    /**
     * Reads the body stream and parses it into a native JSON object.
     * Safe for multiple calls due to internal caching.
     * 
     * @param options Custom options including body size limits.
     * @throws {Error} If the payload cannot be parsed as valid JSON.
     */
    public async json(options?: { limit?: number }): Promise<any> {
        if (this._cachedJson !== undefined) {
            return this._cachedJson;
        }

        const rawText = await this.text(options);
        if (!rawText.trim()) {
            this._cachedJson = {};
            return this._cachedJson;
        }

        try {
            this._cachedJson = JSON.parse(rawText);
            return this._cachedJson;
        } catch (err) {
            throw new Error('Invalid JSON Body');
        }
    }

    /**
     * Reads the body stream and parses it into a `URLSearchParams` object.
     * Designed to parse standard HTTP forms (application/x-www-form-urlencoded).
     * 
     * @param options Custom options including body size limits.
     */
    public async formData(options?: { limit?: number }): Promise<URLSearchParams> {
        if (this._cachedFormData !== undefined) {
            return this._cachedFormData;
        }

        const rawText = await this.text(options);
        this._cachedFormData = new URLSearchParams(rawText);
        return this._cachedFormData;
    }

    /**
     * Reads the body stream and parses multipart/form-data payload (files/images/videos)
     * using native Node.js Buffers without any external runtime dependencies.
     * 
     * @param options Configuration options for parsing the multipart payload.
     * @param options.limit Maximum allowed size of the entire payload in bytes. Defaults to 50MB (52,428,800 bytes).
     * @throws {Error} If Content-Type is invalid or if the payload size exceeds the defined limit.
     */
    public async files(options?: { limit?: number }): Promise<{ files: ParsedFile[]; fields: Record<string, string>; }> {
        if (this._cachedFiles !== undefined && this._cachedMultipartFields !== undefined) {
            return {
                files: this._cachedFiles,
                fields: this._cachedMultipartFields
            };
        }

        const contentType = this.getHeader('content-type');

        if (typeof contentType !== 'string' || !contentType.includes('multipart/form-data')) {
            throw new Error("Content-Type must be multipart/form-data");
        }

        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);

        if (!boundaryMatch) {
            throw new Error("Multipart boundary not found in Content-Type header");
        }

        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const limit = options?.limit ?? 50 * 1024 * 1024;
        const rawBody = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;

            const onData = (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > limit) {
                    cleanup();
                    reject(new Error(`Payload Too Large: Content size exceeded limit of ${limit} bytes`));
                    return;
                }
                chunks.push(chunk);
            };

            const onEnd = () => {
                cleanup();
                resolve(Buffer.concat(chunks));
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const cleanup = () => {
                this.rawRequest.off('data', onData);
                this.rawRequest.off('end', onEnd);
                this.rawRequest.off('error', onError);
            };

            this.rawRequest.on('data', onData);
            this.rawRequest.on('end', onEnd);
            this.rawRequest.on('error', onError);
        });

        const parsedFiles: ParsedFile[] = [];
        const parsedFields: Record<string, string> = {};
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

        let index = 0;

        while (index < rawBody.length) {
            const boundaryIndex = rawBody.indexOf(boundaryBuffer, index);

            if (boundaryIndex === -1)
                break;

            if (rawBody.indexOf(endBoundaryBuffer, boundaryIndex) === boundaryIndex)
                break;

            let nextBoundaryIndex = rawBody.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);

            if (nextBoundaryIndex === -1)
                nextBoundaryIndex = rawBody.indexOf(endBoundaryBuffer, boundaryIndex + boundaryBuffer.length);

            if (nextBoundaryIndex === -1)
                break;

            const partBuffer = rawBody.subarray(boundaryIndex + boundaryBuffer.length + 2, nextBoundaryIndex - 2);
            const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));

            if (headerEndIndex !== -1) {
                const headerText = partBuffer.subarray(0, headerEndIndex).toString('utf8');
                const dataBuffer = partBuffer.subarray(headerEndIndex + 4);
                const dispositionMatch = headerText.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
                const contentTypeMatch = headerText.match(/Content-Type:\s*([^\s;\r\n]+)/i);

                if (dispositionMatch) {
                    const name = dispositionMatch[1];
                    const filename = dispositionMatch[2];

                    if (filename !== undefined) {
                        const mimeType = contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream';

                        parsedFiles.push({
                            fieldName: name,
                            filename,
                            mimeType,
                            data: dataBuffer,
                            size: dataBuffer.length
                        });
                    } else {
                        parsedFields[name] = dataBuffer.toString('utf8');
                    }
                }
            }

            index = nextBoundaryIndex;
        }

        this._cachedFiles = parsedFiles;
        this._cachedMultipartFields = parsedFields;

        return {
            files: parsedFiles,
            fields: parsedFields
        };
    }

    /**
     * Safely resolves the true client IP address, traversing typical proxy header layers.
     */
    private resolveClientIp(request: IncomingMessage): string[] | undefined {
        const cfIp = this.getHeader('cf-connecting-ip');

        if (typeof cfIp === 'string')
            return [cfIp];

        const xForwardedFor = this.getHeader('x-forwarded-for');

        if (typeof xForwardedFor === 'string') {
            const ips = xForwardedFor.split(',');

            if (ips.length > 0) {
                return ips.map(ip => ip.trim());
            }
        }

        return request.socket.remoteAddress ? [request.socket.remoteAddress] : undefined;
    }
}
