/**
 * Configuration options for setting an HTTP Cookie in a type-safe manner.
 */
export interface CookieOptions {
    /**
     * Specifies the host/domain to which the cookie will be sent.
     * @example '.domain.com'
     */
    domain?: string;

    /**
     * Specifies a URL path that must exist in the requested URL in order to send the Cookie header.
     * @default '/'
     * @example '/api'
     */
    path?: string;

    /**
     * The absolute expiration date for the cookie as a `Date` object.
     * If not specified, the cookie becomes a session cookie.
     */
    expires?: Date;

    /**
     * The number of seconds until the cookie expires, relative to the current time.
     * A zero or negative number will expire the cookie immediately.
     * @example 3600 (1 hour)
     */
    maxAge?: number;

    /**
     * If `true`, prevents client-side scripts (such as `document.cookie`) from accessing the cookie.
     * Highly recommended to mitigate Cross-Site Scripting (XSS) attacks.
     * @default false
     */
    httpOnly?: boolean;

    /**
     * If `true`, the cookie will only be transmitted over secure HTTPS protocols.
     * @default false
     */
    secure?: boolean;

    /**
     * Controls whether the cookie is sent with cross-site requests, providing protection against CSRF attacks.
     * - `Strict`: The cookie is never sent in cross-site contexts.
     * - `Lax`: The cookie is sent when the user navigates to the origin site (e.g., clicking a link).
     * - `None`: The cookie is sent in all contexts (requires `secure: true`).
     */
    sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Custom HTTP Response representation for the Mahameru framework.
 * Provides utilities for header manipulation, type-safe cookie setting, and automatic handling of special HTTP status rules.
 */
export class MahameruResponse {
    /**
     * The body payload of the response. Automatically forced to `null` if the HTTP status is 204.
     */
    public body: unknown;

    /**
     * The HTTP status code of the response.
     * @default 200
     */
    public status: number;

    /**
     * An instance of the native Web API `Headers` containing all HTTP headers.
     */
    public headers: Headers;

    /**
     * Creates a new instance of `MahameruResponse`.
     * 
     * @param body The data payload to be sent as the response body.
     * @param init Optional configuration for the response `status` and `headers`.
     * 
     * @example
     * // Creating a standard successful response
     * const res = new MahameruResponse({ message: "Hello World" });
     * 
     * @example
     * // Creating a 204 No Content response
     * const resNoContent = new MahameruResponse(null, { status: 204 });
     */
    constructor(body: unknown, init?: { status?: number; headers?: Headers | Record<string, string> }) {
        this.status = init?.status || 200;

        this.body = this.status === 204 ? null : body;

        if (init?.headers instanceof Headers) {
            this.headers = init.headers;
        } else if (typeof init?.headers === 'object' && init.headers !== null && !Array.isArray(init.headers)) {
            this.headers = new Headers(init.headers);
        } else {
            this.headers = new Headers();
        }

        if (this.status === 204) {
            this.headers.delete('Content-Type');
        } else if (!this.headers.has('Content-Type')) {
            this.headers.set('Content-Type', 'application/json');
        }
    }

    /**
     * A static shortcut method to create a new `MahameruResponse` instance with JSON payloads.
     * 
     * @param body The object or array data to be transformed into a JSON response.
     * @param init Optional configuration for the response status and headers.
     * @returns A new instance of `MahameruResponse`.
     * 
     * @example
     * return MahameruResponse.json({ success: true }, { status: 201 });
     */
    static json(body: unknown, init?: { status?: number; headers?: Headers | Record<string, string> }) {
        return new MahameruResponse(body, init);
    }

    /**
     * Sets a specific value for an HTTP header key.
     * *Note: This method will passively ignore any 'Content-Type' updates if the response status is 204.*
     * 
     * @param key The header name (case-insensitive).
     * @param value The value to be assigned to the header.
     * 
     * @example
     * res.setHeader('Cache-Control', 'no-store');
     */
    public setHeader(key: string, value: string) {
        if (this.status === 204 && key.toLowerCase() === 'content-type')
            return;

        this.headers.set(key, value);
    }

    /**
     * Sets or updates multiple HTTP headers at once using a native Headers instance or a plain object.
     * 
     * @param headers A collection of key-value headers represented as a `Headers` instance or a `Record<string, string>` object literal.
     * 
     * @example
     * res.setHeaders({
     *   'X-Powered-By': 'Mahameru',
     *   'Access-Control-Allow-Origin': '*'
     * });
     */
    public setHeaders(headers: Headers | Record<string, string>) {
        new Headers(headers).forEach((value, key) => {
            this.setHeader(key, value);
        });
    }

    /**
     * Adds an HTTP Cookie to the `Set-Cookie` header in a secure and type-safe way.
     * This method uses `.append()` underneath, enabling support for multi-cookie delivery on a single response.
     * 
     * @param name The unique cookie name.
     * @param value The value of the cookie (automatically encoded via `encodeURIComponent`).
     * @param options Attribute configurations for the cookie (e.g., HttpOnly, Secure, Max-Age).
     * 
     * @example
     * res.setCookie('session_id', 'token123', {
     *   httpOnly: true,
     *   secure: true,
     *   sameSite: 'Lax',
     *   maxAge: 86400
     * });
     */
    public setCookie(name: string, value: string, options: CookieOptions = {}) {
        let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

        if (options.domain) cookieString += `; Domain=${options.domain}`;
        if (options.path) cookieString += `; Path=${options.path}`;
        if (options.expires) cookieString += `; Expires=${options.expires.toUTCString()}`;
        if (options.maxAge !== undefined) cookieString += `; Max-Age=${options.maxAge}`;
        if (options.httpOnly) cookieString += `; HttpOnly`;
        if (options.secure) cookieString += `; Secure`;
        if (options.sameSite) cookieString += `; SameSite=${options.sameSite}`;

        this.headers.append('Set-Cookie', cookieString);
    }
}
