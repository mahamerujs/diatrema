import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { exists } from "./helpers";
import type { Route } from "./route";
import type { Container } from "./container";
import type { MahameruResponse } from "./mahameru-response";
import type { MahameruRequest } from "./mahameru-request";
import type { HTTPMethod, MahameruMiddleware, MahameruMiddlewareContext, MahameruNext, RequestParams } from "./types";
import type { HttpServerError } from "./http-server-error";
import type { Logger } from "./logger";
import type { MahameruServerError } from "./mahameru-server-error";

export type HttpServerDependencies = {
    route: Route;
    container: Container;
    logger: Logger;
    MahameruServerError: typeof MahameruServerError;
    HttpServerError: typeof HttpServerError;
    MahameruResponse: typeof MahameruResponse;
    MahameruRequest: typeof MahameruRequest;
}

type DefaultHTTPResponse = ServerResponse<IncomingMessage> & {
    req: IncomingMessage;
}

type HTTPServerInstance = Server<typeof IncomingMessage, typeof ServerResponse>

interface MahameruResponseLike {
    body: unknown;
    status: number;
    headers?: Headers | Record<string, string>;
}

export type HttpServerOptions = {
    host: string;
    port: number;
    dev: boolean;
    keepAliveTimeout: number;
    disableHttpSignature: boolean;
    httpServerSignature: string;
    httpServerMessage: string;
    allowedOrigins?: string[];
    allowedIps?: string[];
    allowedHosts?: string[]
    trailingSlash: boolean;
    rootPath: string;
    faviconFilePath?: string;
    suportedHTTPMethods: HTTPMethod[]
}

export class HttpServer {
    #options: HttpServerOptions;
    protected readonly defaultOptions: HttpServerOptions = {
        host: '127.0.0.1',
        port: 3000,
        dev: false,
        keepAliveTimeout: 60000,
        disableHttpSignature: false,
        httpServerSignature: 'MahameruJS',
        httpServerMessage: 'Indonesia Bisa!',
        allowedOrigins: undefined,
        allowedIps: undefined,
        allowedHosts: undefined,
        trailingSlash: true,
        rootPath: process.cwd(),
        get faviconFilePath(): string {
            return join(this.rootPath, 'node_modules', 'mahameru', 'favicon.ico');
        },
        suportedHTTPMethods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    }
    protected httpServer: HTTPServerInstance
    protected isShuttingDown = false
    protected dependencies: HttpServerDependencies;

    constructor(dependencies: HttpServerDependencies)
    constructor(options: Partial<HttpServerOptions>, dependencies: HttpServerDependencies)
    constructor(arg1: Partial<HttpServerOptions> | HttpServerDependencies, arg2?: HttpServerDependencies) {
        if (typeof arg2 === 'undefined') {
            this.dependencies = arg1 as HttpServerDependencies;
            this.#options = this.defaultOptions
        } else {
            this.#options = {
                ...this.defaultOptions,
                ...arg1 as Partial<HttpServerOptions>
            };
            this.dependencies = arg2;
        }

        this.httpServer = this.create();
        this.httpServer.on('error', (error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
                const newError = error as any;

                throw new this.dependencies.MahameruServerError(`Port ${newError.port} is already in use`, {
                    code: newError.code,
                    address: newError.address,
                    port: newError.port
                });
            }

            throw error;
        })
    }

    listen() {
        return new Promise<{ port: number; host: string }>((resolve) => {
            this.httpServer.listen(this.#options.port, this.#options.host, () => {
                const address = this.httpServer.address();

                resolve({
                    port: address && typeof address !== "string" ? address.port : this.#options.port,
                    host: address && typeof address !== "string" ? address.address : this.#options.host,
                });
            });
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.httpServer.listening) {
                resolve();

                return;
            }

            this.httpServer.close((error) => {
                if (error) {
                    reject(error);

                    return;
                }

                resolve();
            });
        });
    }

    setIsShuttingDown(isShuttingDown: boolean) {
        this.isShuttingDown = isShuttingDown;
    }

    get listening(): boolean {
        return this.httpServer.listening
    }

    get options(): HttpServerOptions {
        return this.#options
    }

    public setOptions(options: Partial<HttpServerOptions>): void {
        this.#options = {
            ...this.defaultOptions,
            ...options
        }

        if (options.rootPath) {
            this.#options.rootPath = options.rootPath

            if (!options.faviconFilePath)
                this.#options.faviconFilePath = join(this.#options.rootPath, 'node_modules', 'mahameru', 'favicon.ico');
        }
    }

    protected create(): HTTPServerInstance {
        const httpServer = createServer(async (request, response) => await this.handleRequest(request, response));

        httpServer.keepAliveTimeout = this.#options.keepAliveTimeout;
        httpServer.headersTimeout = httpServer.keepAliveTimeout + 1000

        return httpServer;
    }

    protected async handleRequest(request: IncomingMessage, response: ServerResponse<IncomingMessage> & { req: IncomingMessage; }) {
        const mahameruRequest = new this.dependencies.MahameruRequest(request);
        const rawReqPath = mahameruRequest.url.split('?')[0] || '/';
        const rawReqUrl = rawReqPath.replace(/\/+/g, '/');
        const matchUrl = this.dependencies.route.normalizePathForMatching(rawReqUrl);
        const method = mahameruRequest.method;

        try {
            if (this.isShuttingDown)
                response.setHeader('Connection', 'close');

            if (
                typeof this.#options.allowedIps !== 'undefined' &&
                mahameruRequest.ipAddress
            ) {
                if (!this.#options.allowedIps.includes(mahameruRequest.ipAddress))
                    return this.sendResponse(response, new this.dependencies.MahameruResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
            }

            if (typeof this.#options.allowedHosts !== 'undefined' && Array.isArray(this.#options.allowedHosts))
                if (!this.#options.allowedHosts.includes(mahameruRequest.headers.host as string))
                    return this.sendResponse(response, new this.dependencies.MahameruResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

            if (mahameruRequest.url === '/favicon.ico')
                return await this.handleFaviconRequest(mahameruRequest, response);

            if (
                mahameruRequest.headers.origin &&
                this.#options.allowedOrigins &&
                !this.#options.allowedOrigins.includes(mahameruRequest.headers.origin)
            )
                return this.sendResponse(response, new this.dependencies.MahameruResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

            if (this.#options.trailingSlash === false && rawReqUrl.length > 1 && rawReqUrl.endsWith('/')) {
                const cleanUrl = matchUrl;
                const queryStr = mahameruRequest.url?.split('?')[1];
                const redirectPath = cleanUrl + (queryStr ? `?${queryStr}` : '');

                return this.sendResponse(response, new this.dependencies.MahameruResponse(JSON.stringify({ message: 'Redirecting to non-trailing slash URL' }), { status: 301, headers: { Location: redirectPath } }));
            }

            if (rawReqPath !== rawReqUrl) {
                const queryStr = mahameruRequest.url?.includes('?') ? '?' + mahameruRequest.url.split('?')[1] : '';
                const redirectPath = rawReqUrl + queryStr;

                return this.sendResponse(response, new this.dependencies.MahameruResponse(JSON.stringify({ message: 'Redirecting to normalized URL' }), { status: 301, headers: { Location: redirectPath } }));
            }

            const { matchedRoute, matchResult, notFoundResponse } = await this.dependencies.route.resolveRoute(mahameruRequest);
            const middlewareHandler = this.dependencies.container.middlewareHandler;

            if (!matchedRoute || !matchResult) {
                const routeHandler: MahameruNext = async () => notFoundResponse;
                const rawResponse = middlewareHandler
                    ? await middlewareHandler({
                        request: mahameruRequest,
                        container: this.dependencies.container.mahameruContainer,
                        method,
                        params: {},
                        path: rawReqUrl,
                        status: 404
                    }, false, routeHandler)
                    : await routeHandler();

                const mahameruResponse = this.normalizeMahameruResponse(rawResponse, 'Middleware must return a MahameruResponse instance.');

                return this.sendResponse(response, mahameruResponse);
            }

            const handler = matchedRoute.routeHandlers[method];

            if (!handler) {
                response.writeHead(405);

                return response.end(JSON.stringify({ error: `Method ${method} Not Allowed` }));
            }

            const params: RequestParams = {};

            if (matchResult && matchedRoute.paramNames.length > 0)
                matchedRoute.paramNames.forEach((name, index) => {
                    params[name] = matchResult[index + 1];
                });

            const mahameruResponse = middlewareHandler
                ? await this.runMiddlewarePipeline(
                    middlewareHandler,
                    {
                        request: mahameruRequest,
                        container: this.dependencies.container.mahameruContainer,
                        params,
                        path: rawReqUrl,
                        method,
                        status: 200
                    },
                    () => handler(mahameruRequest, this.dependencies.container.mahameruContainer, { params })
                )
                : await handler(
                    mahameruRequest,
                    this.dependencies.container.mahameruContainer,
                    { params }
                );

            return this.sendResponse(response, mahameruResponse);
        } catch (error: unknown) {
            console.error(error);
            const errorResponse = await this.runErrorHandler(
                error,
                {
                    request: mahameruRequest,
                    container: this.dependencies.container.mahameruContainer,
                    path: rawReqUrl,
                    method,
                    params: {},
                    status: 200
                }
            );

            return this.sendResponse(response, errorResponse);
        }
    }

    protected async handleFaviconRequest(request: MahameruRequest, response: DefaultHTTPResponse) {
        let targetFaviconPath: string | undefined = undefined;
        const customFaviconPath = join(this.#options.rootPath, 'favicon.ico');

        if (await exists(customFaviconPath)) {
            targetFaviconPath = customFaviconPath;
        } else if (this.#options.faviconFilePath && await exists(this.#options.faviconFilePath)) {
            targetFaviconPath = this.#options.faviconFilePath;
        }

        if (targetFaviconPath === undefined) {
            return this.sendResponse(
                response,
                new this.dependencies.MahameruResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
            );
        }

        const favicon = await readFile(targetFaviconPath);
        const middlewareHandler = this.dependencies.container.middlewareHandler;

        if (middlewareHandler) {
            const middlewareResponse = await middlewareHandler({
                request,
                container: this.dependencies.container.mahameruContainer,
                method: request.method,
                params: {},
                path: request.path,
                status: 200
            }, false, async () => new this.dependencies.MahameruResponse(favicon, { status: 200 }));

            const normalized = this.normalizeMahameruResponse(middlewareResponse, 'Middleware error');
            const headers = new Headers(normalized.headers);

            if (normalized.status === 200) {
                headers.set('Content-Type', 'image/x-icon');

                if (!headers.has('Cache-Control')) {
                    headers.set('Cache-Control', 'public, max-age=31536000');
                }
            }

            return this.sendResponse(response, new this.dependencies.MahameruResponse(normalized.body, {
                status: normalized.status,
                headers
            }));
        }

        const faviconResponse = new this.dependencies.MahameruResponse(favicon, {
            status: 200,
            headers: {
                'Content-Type': 'image/x-icon',
                'Cache-Control': 'public, max-age=31536000'
            }
        });

        return this.sendResponse(response, faviconResponse);
    }

    protected sendResponse(response: DefaultHTTPResponse, mahameruResponse?: MahameruResponse) {
        if (!mahameruResponse)
            mahameruResponse = new this.dependencies.MahameruResponse(undefined, { status: 204 });

        mahameruResponse.headers.forEach((value, key) => {
            response.setHeader(key, value);
        });

        if (!this.#options.disableHttpSignature) {
            response.setHeader('X-Powered-By', this.#options.httpServerSignature);
            response.setHeader('X-Message', this.#options.httpServerMessage);
        }

        response.writeHead(mahameruResponse.status);

        let responseBody: any;

        if (typeof mahameruResponse.body === 'string' ||
            mahameruResponse.body instanceof Uint8Array ||
            Buffer.isBuffer(mahameruResponse.body) ||
            mahameruResponse.body === undefined ||
            mahameruResponse.body === null) {

            responseBody = mahameruResponse.body;
        } else {
            responseBody = JSON.stringify(mahameruResponse.body);
        }

        response.end(responseBody);
        this.dependencies.logger.info(response.req.method, response.statusCode, response.req.url);
    }

    protected async runMiddlewarePipeline(
        middleware: MahameruMiddleware,
        context: MahameruMiddlewareContext,
        handler: () => Promise<MahameruResponse> | MahameruResponse
    ) {
        const isProtectedRoute = this.validateProtectedRoute(context.method, context.path);
        const response = await middleware(context, isProtectedRoute, async () => {
            const nextResponse = await handler();

            return this.normalizeMahameruResponse(
                nextResponse,
                'Route handlers and next() must resolve to MahameruResponse.'
            );
        });

        return this.normalizeMahameruResponse(
            response,
            'Global middleware must return a MahameruResponse instance.'
        );
    }

    protected async runErrorHandler(error: unknown, context: MahameruMiddlewareContext): Promise<MahameruResponse> {
        const fallbackResponse = this.createInternalServerErrorResponse(error);

        if (!this.dependencies.container.errorHandler)
            return fallbackResponse;

        try {
            const handlerResponse = await this.dependencies.container.errorHandler(
                {
                    ...context,
                    error
                },
                async () => fallbackResponse
            );

            return this.normalizeMahameruResponse(
                handlerResponse,
                'Error handler must return a MahameruResponse instance.'
            );
        } catch (handlerError: unknown) {
            return fallbackResponse;
        }
    }

    protected createInternalServerErrorResponse(error: unknown): MahameruResponse {
        const serverError = error instanceof this.dependencies.HttpServerError
            ? error
            : new this.dependencies.HttpServerError(error instanceof Error ? error.message : undefined);

        return this.dependencies.MahameruResponse.json(
            { error: serverError.message },
            { status: serverError.statusCode }
        );
    }

    protected isMahameruResponseLike(value: unknown): value is MahameruResponseLike {
        if (!value || typeof value !== 'object') {
            return false;
        }

        if (!('status' in value) || typeof value.status !== 'number') {
            return false;
        }

        if (!('body' in value)) {
            return false;
        }

        if (!('headers' in value) || value.headers === undefined) {
            return true;
        }

        if (value.headers instanceof Headers) {
            return true;
        }

        return typeof value.headers === 'object' && value.headers !== null && !Array.isArray(value.headers);
    }

    protected normalizeMahameruResponse(value: unknown, errorMessage: string): MahameruResponse {
        if (value instanceof this.dependencies.MahameruResponse)
            return value;

        if (!this.isMahameruResponseLike(value))
            throw new this.dependencies.HttpServerError(errorMessage);

        const normalizedHeaders = value.headers instanceof Headers
            ? Object.fromEntries(value.headers.entries())
            : value.headers;

        return new this.dependencies.MahameruResponse(value.body, {
            status: value.status,
            headers: normalizedHeaders
        });
    }

    protected matchRoutePattern(currentPath: string, routePattern: string): boolean {
        const regexPattern = routePattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\//g, '\\/')
            .replace(/:[^/]+/g, '[^/]+');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(currentPath);
    }

    protected validateProtectedRoute(method: HTTPMethod, path: string): boolean {
        if (path.endsWith('/'))
            path = path.slice(0, -1);

        return this.dependencies.container.protectedRoutes.some(route => {
            if (typeof route === 'string')
                return this.matchRoutePattern(path, route);

            const isPathMatch = this.matchRoutePattern(path, route.path);
            const isMethodMatch = route.methods.includes(method);

            return isPathMatch && isMethodMatch;
        });
    }

    protected requestLogger(response: DefaultHTTPResponse) {
        if (!this.#options.dev)
            return

        this.dependencies.logger.info(`${response.req.method} ${response.statusCode} ${response.req.url}`);
    }
}
